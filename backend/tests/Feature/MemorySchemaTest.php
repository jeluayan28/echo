<?php

namespace Tests\Feature;

use App\Enums\MemoryType;
use App\Models\Attachment;
use App\Models\Memory;
use App\Models\MemoryLink;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Locks in the data model the mobile app expects (see mobile/src/data/types.ts).
 */
class MemorySchemaTest extends TestCase
{
    use RefreshDatabase;

    private function memoryFor(User $user, array $attrs = []): Memory
    {
        return $user->memories()->create(array_merge(
            ['type' => 'note', 'title' => 'A memory'],
            $attrs,
        ));
    }

    public function test_a_memory_has_the_expected_fields_and_defaults(): void
    {
        $user = User::factory()->create();
        $memory = $this->memoryFor($user)->fresh();

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

        $a->tags()->attach($tag);
        $b->tags()->attach($tag);

        $this->assertCount(2, $tag->memories);

        $this->expectException(UniqueConstraintViolationException::class);
        $user->tags()->create(['name' => 'product']);
    }

    public function test_an_untagged_memory_without_a_collection_is_valid(): void
    {
        $memory = $this->memoryFor(User::factory()->create());

        $this->assertCount(0, $memory->tags);
        $this->assertNull($memory->collection);
    }

    public function test_deleting_a_collection_keeps_its_memories(): void
    {
        $user = User::factory()->create();
        $collection = $user->collections()->create(['name' => 'Reading']);
        $memory = $this->memoryFor($user, ['collection_id' => $collection->id]);

        $collection->delete();

        $this->assertNotNull(Memory::find($memory->id));
        $this->assertNull($memory->fresh()->collection_id);
    }

    public function test_deleting_a_memory_is_soft_and_can_be_restored(): void
    {
        $memory = $this->memoryFor(User::factory()->create());

        $memory->delete();
        $this->assertNull(Memory::find($memory->id));
        $this->assertNotNull(Memory::onlyTrashed()->find($memory->id));

        Memory::onlyTrashed()->find($memory->id)->restore();
        $this->assertNotNull(Memory::find($memory->id));
    }

    public function test_force_deleting_a_memory_removes_its_tag_link_and_attachment_rows(): void
    {
        $user = User::factory()->create();
        $a = $this->memoryFor($user);
        $b = $this->memoryFor($user);
        $a->tags()->attach($user->tags()->create(['name' => 'x']));
        MemoryLink::create(['user_id' => $user->id, 'from_memory_id' => $a->id, 'to_memory_id' => $b->id]);
        $a->attachment()->create([
            'kind' => 'audio', 'disk' => 'local', 'path' => 'voice/a.m4a', 'mime_type' => 'audio/mp4',
        ]);

        $a->forceDelete();

        $this->assertDatabaseCount('memory_tag', 0);
        $this->assertDatabaseCount('memory_links', 0);
        $this->assertDatabaseCount('attachments', 0);
        $this->assertNotNull(Memory::find($b->id)); // the other end of the link survives
    }

    public function test_a_link_between_the_same_two_memories_can_only_exist_once(): void
    {
        $user = User::factory()->create();
        $a = $this->memoryFor($user);
        $b = $this->memoryFor($user);
        $pair = ['user_id' => $user->id, 'from_memory_id' => $a->id, 'to_memory_id' => $b->id];

        MemoryLink::create($pair);

        $this->expectException(UniqueConstraintViolationException::class);
        MemoryLink::create($pair);
    }

    public function test_attachments_store_metadata_and_a_storage_reference_never_the_file(): void
    {
        $user = User::factory()->create();
        $memory = $this->memoryFor($user, ['type' => 'voice']);

        $attachment = $memory->attachment()->create([
            'kind' => 'audio',
            'disk' => 's3',
            'path' => 'voice/2026/10/abc.m4a',
            'mime_type' => 'audio/mp4',
            'size_bytes' => 48_213,
            'duration_ms' => 12_400,
        ]);

        $this->assertInstanceOf(Attachment::class, $memory->fresh()->attachment);
        $this->assertSame(12_400, $attachment->fresh()->duration_ms);

        // Guard against someone adding a blob column later.
        foreach (Schema::getColumns('attachments') as $column) {
            $type = strtolower($column['type_name']);
            $this->assertStringNotContainsString('blob', $type, "attachments.{$column['name']} must not hold binary data");
            $this->assertStringNotContainsString('bytea', $type, "attachments.{$column['name']} must not hold binary data");
        }
    }
}
