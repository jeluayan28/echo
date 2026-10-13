<?php

namespace Tests\Feature;

use App\Enums\MemoryType;
use App\Models\Attachment;
use App\Models\Memory;
use App\Models\MemoryLink;
use App\Models\MemoryReminder;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Locks in the data model and the constraints the database itself enforces (independently of the API).
 * Runs on PostgreSQL: composite foreign keys, CHECK constraints and the generated search column.
 */
class MemorySchemaTest extends TestCase
{
    use RefreshDatabase;

    private function memoryFor(User $user, array $attrs = []): Memory
    {
        return $user->memories()->create(array_merge(['type' => 'note', 'title' => 'A memory'], $attrs));
    }

    private function link(User $user, Memory $a, Memory $b): MemoryLink
    {
        [$from, $to] = MemoryLink::canonical($a->id, $b->id);

        return MemoryLink::create(['user_id' => $user->id, 'from_memory_id' => $from, 'to_memory_id' => $to]);
    }

    // ── model basics ─────────────────────────────────────────────────────────

    public function test_a_memory_has_the_expected_fields_and_defaults(): void
    {
        $memory = $this->memoryFor(User::factory()->create())->fresh();

        $this->assertSame(26, strlen($memory->id)); // ULID, not an enumerable integer
        $this->assertSame(MemoryType::Note, $memory->type);
        $this->assertNull($memory->body);
        $this->assertNull($memory->source_url);
        $this->assertNull($memory->collection_id);
        $this->assertFalse($memory->favorite);
        $this->assertFalse($memory->pinned);
        $this->assertNotNull($memory->created_at);
        $this->assertNotNull($memory->updated_at);
    }

    public function test_all_four_memory_types_are_supported(): void
    {
        $user = User::factory()->create();
        foreach (['note', 'idea', 'link', 'voice'] as $type) {
            $this->assertSame($type, $this->memoryFor($user, ['type' => $type])->fresh()->type->value);
        }
    }

    public function test_tags_are_unique_per_user_and_shared_by_memories(): void
    {
        $user = User::factory()->create();
        $a = $this->memoryFor($user);
        $b = $this->memoryFor($user);
        $tag = $user->tags()->create(['name' => 'product']);

        $a->tags()->attach($tag, ['user_id' => $user->id]);
        $b->tags()->attach($tag, ['user_id' => $user->id]);

        $this->assertCount(2, $tag->memories);

        $this->expectException(UniqueConstraintViolationException::class);
        $user->tags()->create(['name' => 'product']);
    }

    public function test_two_users_may_use_the_same_tag_name(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $a->tags()->create(['name' => 'ideas']);
        $b->tags()->create(['name' => 'ideas']);

        $this->assertDatabaseCount('tags', 2);
    }

    public function test_deleting_a_collection_keeps_its_memories_and_their_owner(): void
    {
        $user = User::factory()->create();
        $collection = $user->collections()->create(['name' => 'Reading']);
        $memory = $this->memoryFor($user, ['collection_id' => $collection->id]);

        $collection->delete();

        $fresh = Memory::find($memory->id);
        $this->assertNotNull($fresh);
        $this->assertNull($fresh->collection_id);
        $this->assertSame($user->id, $fresh->user_id); // SET NULL touched ONLY collection_id
    }

    public function test_deleting_a_memory_is_soft_and_can_be_restored_with_its_links_and_tags(): void
    {
        $user = User::factory()->create();
        $a = $this->memoryFor($user);
        $b = $this->memoryFor($user);
        $this->link($user, $a, $b);
        $a->tags()->attach($user->tags()->create(['name' => 'x']), ['user_id' => $user->id]);

        $a->delete();
        $this->assertNull(Memory::find($a->id));
        $this->assertDatabaseCount('memory_links', 1); // soft delete removes nothing: Undo can restore it all
        $this->assertDatabaseCount('memory_tag', 1);

        Memory::onlyTrashed()->find($a->id)->restore();
        $this->assertNotNull(Memory::find($a->id));
    }

    public function test_force_deleting_a_memory_removes_its_dependents_but_not_the_other_end(): void
    {
        $user = User::factory()->create();
        $a = $this->memoryFor($user);
        $b = $this->memoryFor($user);
        $a->tags()->attach($user->tags()->create(['name' => 'x']), ['user_id' => $user->id]);
        $this->link($user, $a, $b);
        $a->attachment()->create(['user_id' => $user->id, 'kind' => 'audio', 'disk' => 'local', 'path' => 'v/a.m4a', 'mime_type' => 'audio/mp4']);
        MemoryReminder::create(['user_id' => $user->id, 'memory_id' => $a->id, 'remind_at' => now()->addDay()]);

        $a->forceDelete();

        $this->assertDatabaseCount('memory_tag', 0);
        $this->assertDatabaseCount('memory_links', 0);
        $this->assertDatabaseCount('attachments', 0);
        $this->assertDatabaseCount('memory_reminders', 0);
        $this->assertNotNull(Memory::find($b->id));
        $this->assertDatabaseCount('tags', 1); // the tag itself survives
    }

    public function test_deleting_a_user_removes_everything_they_own_and_nothing_else(): void
    {
        $gone = User::factory()->create();
        $stays = User::factory()->create();
        $m = $this->memoryFor($gone);
        $this->memoryFor($stays);
        $gone->collections()->create(['name' => 'c']);
        $m->tags()->attach($gone->tags()->create(['name' => 't']), ['user_id' => $gone->id]);

        $gone->delete();

        $this->assertSame(1, Memory::withTrashed()->count());
        $this->assertDatabaseCount('collections', 0);
        $this->assertDatabaseCount('tags', 0);
        $this->assertDatabaseCount('memory_tag', 0);
    }

    public function test_attachments_store_metadata_and_a_storage_reference_never_the_file(): void
    {
        $user = User::factory()->create();
        $memory = $this->memoryFor($user, ['type' => 'voice']);
        $attachment = $memory->attachment()->create([
            'user_id' => $user->id, 'kind' => 'audio', 'disk' => 's3', 'path' => 'voice/2026/10/abc.m4a',
            'mime_type' => 'audio/mp4', 'size_bytes' => 48_213, 'duration_ms' => 12_400,
        ]);

        $this->assertInstanceOf(Attachment::class, $memory->fresh()->attachment);
        $this->assertSame(12_400, $attachment->fresh()->duration_ms);

        foreach (Schema::getColumns('attachments') as $column) {
            $type = strtolower($column['type_name']);
            $this->assertStringNotContainsString('blob', $type, "attachments.{$column['name']} must not hold binary data");
            $this->assertStringNotContainsString('bytea', $type, "attachments.{$column['name']} must not hold binary data");
        }
    }

    public function test_an_attachment_serializes_without_its_storage_internals(): void
    {
        $attachment = Attachment::factory()->create();
        $this->assertArrayNotHasKey('path', $attachment->toArray());
        $this->assertArrayNotHasKey('disk', $attachment->toArray());
    }

    public function test_one_attachment_per_memory(): void
    {
        $user = User::factory()->create();
        $memory = $this->memoryFor($user, ['type' => 'voice']);
        Attachment::factory()->create(['user_id' => $user->id, 'memory_id' => $memory->id]);

        $this->expectException(UniqueConstraintViolationException::class);
        Attachment::factory()->create(['user_id' => $user->id, 'memory_id' => $memory->id]);
    }

    // ── relationships: the database refuses what the API must also refuse ────

    public function test_a_memory_cannot_link_to_itself(): void
    {
        $user = User::factory()->create();
        $a = $this->memoryFor($user);

        $this->expectException(QueryException::class);
        MemoryLink::create(['user_id' => $user->id, 'from_memory_id' => $a->id, 'to_memory_id' => $a->id]);
    }

    public function test_a_pair_can_only_be_linked_once_in_either_direction(): void
    {
        $user = User::factory()->create();
        $a = $this->memoryFor($user);
        $b = $this->memoryFor($user);
        $this->link($user, $a, $b);

        // same pair again
        try {
            $this->link($user, $a, $b);
            $this->fail('duplicate link accepted');
        } catch (UniqueConstraintViolationException) {
            $this->assertTrue(true);
        }

        // the reversed pair (b, a) is rejected too, by the canonical-order CHECK
        [$from, $to] = MemoryLink::canonical($a->id, $b->id);
        $this->expectException(QueryException::class);
        MemoryLink::create(['user_id' => $user->id, 'from_memory_id' => $to, 'to_memory_id' => $from]);
    }

    public function test_a_link_cannot_connect_memories_of_two_different_users(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $mine = $this->memoryFor($alice);
        $theirs = $this->memoryFor($bob);
        [$from, $to] = MemoryLink::canonical($mine->id, $theirs->id);

        $this->expectException(QueryException::class);
        MemoryLink::create(['user_id' => $alice->id, 'from_memory_id' => $from, 'to_memory_id' => $to]);
    }

    public function test_a_memory_cannot_be_put_in_another_users_collection(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $bobsCollection = $bob->collections()->create(['name' => 'Bob']);

        $this->expectException(QueryException::class);
        $this->memoryFor($alice, ['collection_id' => $bobsCollection->id]);
    }

    public function test_a_memory_cannot_get_another_users_tag(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $memory = $this->memoryFor($alice);
        $bobsTag = $bob->tags()->create(['name' => 'secret']);

        $this->expectException(QueryException::class);
        DB::table('memory_tag')->insert(['user_id' => $alice->id, 'memory_id' => $memory->id, 'tag_id' => $bobsTag->id]);
    }

    public function test_a_reminder_and_an_attachment_must_belong_to_the_memory_owner(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $memory = $this->memoryFor($alice);

        try {
            MemoryReminder::create(['user_id' => $bob->id, 'memory_id' => $memory->id, 'remind_at' => now()->addDay()]);
            $this->fail('cross-user reminder accepted');
        } catch (QueryException) {
            $this->assertTrue(true);
        }

        $this->expectException(QueryException::class);
        Attachment::factory()->create(['user_id' => $bob->id, 'memory_id' => $memory->id]);
    }

    // ── value constraints ────────────────────────────────────────────────────

    public function test_invalid_memory_types_and_blank_titles_are_rejected(): void
    {
        $user = User::factory()->create();

        try {
            DB::table('memories')->insert(['id' => (string) Str::ulid(), 'user_id' => $user->id, 'type' => 'video', 'title' => 'x', 'created_at' => now(), 'updated_at' => now()]);
            $this->fail('invalid type accepted');
        } catch (QueryException) {
            $this->assertTrue(true);
        }

        $this->expectException(QueryException::class);
        $this->memoryFor($user, ['title' => '   ']);
    }

    public function test_tag_names_must_be_normalized(): void
    {
        $user = User::factory()->create();

        $this->expectException(QueryException::class);
        $user->tags()->create(['name' => 'Not Normalized']);
    }

    public function test_one_reminder_per_memory(): void
    {
        $user = User::factory()->create();
        $memory = $this->memoryFor($user);
        MemoryReminder::create(['user_id' => $user->id, 'memory_id' => $memory->id, 'remind_at' => now()->addDay()]);

        $this->expectException(UniqueConstraintViolationException::class);
        MemoryReminder::create(['user_id' => $user->id, 'memory_id' => $memory->id, 'remind_at' => now()->addDays(2)]);
    }

    public function test_the_search_vector_tracks_title_and_content_automatically(): void
    {
        $user = User::factory()->create();
        $memory = $this->memoryFor($user, ['title' => 'Passport renewal', 'body' => 'book an appointment']);

        $matches = fn (string $q) => Memory::query()->whereRaw("search_vector @@ to_tsquery('simple', ?)", [$q])->count();
        $this->assertSame(1, $matches('passport'));
        $this->assertSame(1, $matches('appointment'));
        $this->assertSame(0, $matches('zebra'));

        $memory->update(['title' => 'Zebra crossing']);
        $this->assertSame(1, $matches('zebra'));
        $this->assertSame(0, $matches('passport'));
    }

    public function test_the_expected_indexes_exist(): void
    {
        $indexes = fn (string $table) => collect(Schema::getIndexes($table))->pluck('name')->all();

        $this->assertContains('memories_search_vector_gin', $indexes('memories'));
        $this->assertContains('tags_user_name_prefix', $indexes('tags'));
        $this->assertContains('memories_user_id_updated_at_index', $indexes('memories'));
        $this->assertContains('memories_user_id_type_index', $indexes('memories'));
        $this->assertContains('memory_reminders_user_id_remind_at_index', $indexes('memory_reminders'));
    }
}
