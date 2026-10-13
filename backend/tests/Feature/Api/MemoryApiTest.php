<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Memory;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

class MemoryApiTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    // ── create ───────────────────────────────────────────────────────────────

    public function test_a_note_can_be_created_with_normalized_tags_and_a_collection(): void
    {
        $collection = $this->user->collections()->create(['name' => 'Ideas']);

        $response = $this->postJson('/api/v1/memories', [
            'type' => 'note', 'title' => 'Hello', 'body' => 'World', 'favorite' => true,
            'collection_id' => $collection->id,
            'tags' => ['  #Product ', 'product', 'UX', ''],
        ])->assertCreated()
            ->assertJsonPath('data.title', 'Hello')
            ->assertJsonPath('data.type', 'note')
            ->assertJsonPath('data.favorite', true)
            ->assertJsonPath('data.collection_id', $collection->id)
            ->assertJsonPath('data.tags', ['product', 'ux'])
            ->assertJsonPath('data.linked_ids', [])
            ->assertJsonMissingPath('data.user_id');

        $this->assertSame(26, strlen($response->json('data.id')));
        $this->assertDatabaseHas('memories', ['id' => $response->json('data.id'), 'user_id' => $this->user->id]);
        $this->assertSame(2, $this->user->tags()->count());
    }

    public function test_the_owner_comes_from_the_token_never_from_the_request(): void
    {
        $other = User::factory()->create();

        $id = $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'Mine', 'user_id' => $other->id])
            ->assertCreated()->json('data.id');

        $this->assertDatabaseHas('memories', ['id' => $id, 'user_id' => $this->user->id]);
    }

    public function test_every_type_can_be_created_and_link_memories_need_an_http_url(): void
    {
        foreach (['note', 'idea'] as $type) {
            $this->postJson('/api/v1/memories', ['type' => $type, 'title' => $type])->assertCreated();
        }
        $this->postJson('/api/v1/memories', ['type' => 'link', 'title' => 'x'])
            ->assertUnprocessable()->assertJsonValidationErrors(['source_url']);
        $this->postJson('/api/v1/memories', ['type' => 'link', 'title' => 'x', 'source_url' => 'javascript:alert(1)'])
            ->assertUnprocessable()->assertJsonValidationErrors(['source_url']);
        $this->postJson('/api/v1/memories', ['type' => 'link', 'title' => 'x', 'source_url' => 'ftp://example.com/a'])
            ->assertUnprocessable()->assertJsonValidationErrors(['source_url']);
        $this->postJson('/api/v1/memories', ['type' => 'link', 'title' => 'x', 'source_url' => 'https://example.com/a'])
            ->assertCreated()->assertJsonPath('data.source_url', 'https://example.com/a');
    }

    public function test_creation_is_validated(): void
    {
        $this->postJson('/api/v1/memories', [])->assertUnprocessable()->assertJsonValidationErrors(['type', 'title']);
        $this->postJson('/api/v1/memories', ['type' => 'video', 'title' => 'x'])->assertUnprocessable()->assertJsonValidationErrors(['type']);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => '   '])->assertUnprocessable()->assertJsonValidationErrors(['title']);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => str_repeat('a', 121)])->assertUnprocessable()->assertJsonValidationErrors(['title']);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'body' => str_repeat('a', 10001)])->assertUnprocessable()->assertJsonValidationErrors(['body']);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'tags' => range(1, 11)])->assertUnprocessable()->assertJsonValidationErrors(['tags']);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'tags' => [str_repeat('a', 31)]])->assertUnprocessable()->assertJsonValidationErrors(['tags.0']);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'favorite' => 'maybe'])->assertUnprocessable()->assertJsonValidationErrors(['favorite']);
        $this->assertDatabaseCount('memories', 0);
    }

    public function test_a_memory_cannot_be_put_in_another_users_collection(): void
    {
        $theirs = User::factory()->create()->collections()->create(['name' => 'Theirs']);

        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'collection_id' => $theirs->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['collection_id']);
    }

    public function test_voice_memories_require_one_of_your_unclaimed_uploads(): void
    {
        $this->postJson('/api/v1/memories', ['type' => 'voice', 'title' => 'x'])
            ->assertUnprocessable()->assertJsonValidationErrors(['attachment_id']);

        $theirs = Attachment::factory()->create(); // belongs to someone else
        $this->postJson('/api/v1/memories', ['type' => 'voice', 'title' => 'x', 'attachment_id' => $theirs->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['attachment_id']);

        $mine = Attachment::factory()->create(['user_id' => $this->user->id]);
        $this->postJson('/api/v1/memories', ['type' => 'voice', 'title' => 'x', 'attachment_id' => $mine->id])
            ->assertCreated()->assertJsonPath('data.attachment.id', $mine->id);
        $this->assertSame(1, Attachment::whereNotNull('memory_id')->count());

        // an upload can be used once
        $this->postJson('/api/v1/memories', ['type' => 'voice', 'title' => 'again', 'attachment_id' => $mine->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['attachment_id']);
    }

    public function test_only_voice_memories_can_have_a_recording(): void
    {
        $upload = Attachment::factory()->create(['user_id' => $this->user->id]);

        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'attachment_id' => $upload->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['attachment_id']);
    }

    // ── read ─────────────────────────────────────────────────────────────────

    public function test_show_returns_the_full_memory_with_links_and_hides_internals(): void
    {
        $a = $this->memory($this->user, ['title' => 'A', 'body' => 'full body']);
        $b = $this->memory($this->user, ['title' => 'B']);
        $this->link($this->user, $a, $b);

        $this->getJson("/api/v1/memories/{$a->id}")
            ->assertOk()
            ->assertJsonPath('data.body', 'full body')
            ->assertJsonPath('data.linked_ids', [$b->id])
            ->assertJsonMissingPath('data.user_id')
            ->assertJsonMissingPath('data.search_vector');
    }

    public function test_the_list_returns_excerpts_not_full_bodies_and_paginates(): void
    {
        $this->memory($this->user, ['body' => str_repeat('x', 500)]);

        $row = $this->getJson('/api/v1/memories')->assertOk()
            ->assertJsonStructure(['data' => [['id', 'title', 'excerpt', 'tags', 'link_count']], 'links', 'meta' => ['current_page', 'per_page', 'total', 'last_page']])
            ->json('data.0');

        $this->assertArrayNotHasKey('body', $row);
        $this->assertArrayNotHasKey('user_id', $row);
        $this->assertSame(200, strlen($row['excerpt']));
    }

    public function test_pagination_is_bounded(): void
    {
        Memory::factory()->forUser($this->user)->count(30)->create();

        $this->getJson('/api/v1/memories?per_page=10')->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 30);
        $this->getJson('/api/v1/memories?per_page=10&page=3')->assertJsonCount(10, 'data');
        $this->getJson('/api/v1/memories?per_page=100000')->assertJsonPath('meta.per_page', 100);
        $this->getJson('/api/v1/memories?per_page=0')->assertJsonPath('meta.per_page', 1);
        $this->getJson('/api/v1/memories')->assertJsonPath('meta.per_page', 25);
    }

    public function test_pagination_does_not_repeat_or_skip_rows_when_timestamps_tie(): void
    {
        $now = now();
        Memory::factory()->forUser($this->user)->count(12)->create(['created_at' => $now, 'updated_at' => $now]);

        $ids = collect([1, 2, 3])->flatMap(fn ($p) => $this->getJson("/api/v1/memories?per_page=5&page={$p}")->json('data.*.id'));

        $this->assertCount(12, $ids);
        $this->assertCount(12, $ids->unique());
    }

    public function test_the_list_can_be_filtered(): void
    {
        $c = $this->user->collections()->create(['name' => 'C']);
        $a = $this->memory($this->user, ['type' => 'idea', 'favorite' => true, 'collection_id' => $c->id]);
        $b = $this->memory($this->user, ['type' => 'note', 'pinned' => true]);
        $this->postJson('/api/v1/memories', ['type' => 'link', 'title' => 'L', 'source_url' => 'https://e.com', 'tags' => ['Research']]);

        $ids = fn (string $qs) => collect($this->getJson("/api/v1/memories?{$qs}")->assertOk()->json('data.*.id'))->all();

        $this->assertSame([$a->id], $ids('type=idea'));
        $this->assertSame([$a->id], $ids('favorite=1'));
        $this->assertSame([$b->id], $ids('pinned=1'));
        $this->assertSame([$a->id], $ids("collection_id={$c->id}"));
        $this->assertCount(2, $ids('collection_id=none'));
        $this->assertCount(1, $ids('tag=research'));
        $this->assertCount(1, $ids('tag=%23Research')); // "#Research" normalizes the same way
        $this->assertSame([], $ids('type=note&favorite=1'));
    }

    public function test_sorting_is_whitelisted(): void
    {
        $this->getJson('/api/v1/memories?sort=title;drop table memories')->assertUnprocessable()->assertJsonValidationErrors(['sort']);
        $this->getJson('/api/v1/memories?sort=password')->assertUnprocessable();
        $this->getJson('/api/v1/memories?direction=sideways')->assertUnprocessable();

        $this->memory($this->user, ['title' => 'B']);
        $this->memory($this->user, ['title' => 'A']);
        $this->assertSame(['A', 'B'], $this->getJson('/api/v1/memories?sort=title&direction=asc')->json('data.*.title'));
    }

    public function test_updated_since_supports_incremental_sync(): void
    {
        $old = $this->memory($this->user, ['updated_at' => now()->subDays(5)]);
        $new = $this->memory($this->user);

        $ids = $this->getJson('/api/v1/memories?updated_since='.urlencode(now()->subDay()->toIso8601String()))->json('data.*.id');

        $this->assertSame([$new->id], $ids);
        $this->assertNotContains($old->id, $ids);
    }

    public function test_listing_does_not_run_n_plus_one_queries(): void
    {
        Memory::factory()->forUser($this->user)->count(3)->create();
        $few = $this->queryCount(fn () => $this->getJson('/api/v1/memories?per_page=100')->assertOk());

        Memory::factory()->forUser($this->user)->count(30)->create()->each(function (Memory $m) {
            $m->tags()->attach($this->user->tags()->firstOrCreate(['name' => 't'.$m->id[-4]]), ['user_id' => $this->user->id]);
        });
        $many = $this->queryCount(fn () => $this->getJson('/api/v1/memories?per_page=100')->assertOk());

        $this->assertSame($few, $many, 'The number of queries must not grow with the number of memories.');
    }

    public function test_link_count_ignores_memories_in_the_trash(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);
        $c = $this->memory($this->user);
        $this->link($this->user, $a, $b);
        $this->link($this->user, $a, $c);
        $c->delete();

        $row = collect($this->getJson('/api/v1/memories')->json('data'))->firstWhere('id', $a->id);
        $this->assertSame(1, $row['link_count']);
        $this->getJson("/api/v1/memories/{$a->id}")->assertJsonPath('data.linked_ids', [$b->id]);
    }

    // ── update ───────────────────────────────────────────────────────────────

    public function test_a_memory_can_be_partially_updated(): void
    {
        $m = $this->memory($this->user, ['title' => 'Old', 'body' => 'keep me']);
        $m->tags()->attach($this->user->tags()->create(['name' => 'old']), ['user_id' => $this->user->id]);

        $this->patchJson("/api/v1/memories/{$m->id}", ['title' => 'New', 'favorite' => true])
            ->assertOk()->assertJsonPath('data.title', 'New')->assertJsonPath('data.body', 'keep me')
            ->assertJsonPath('data.tags', ['old']); // tags untouched when not sent

        $this->patchJson("/api/v1/memories/{$m->id}", ['tags' => ['fresh']])
            ->assertOk()->assertJsonPath('data.tags', ['fresh']); // replaced

        $this->patchJson("/api/v1/memories/{$m->id}", ['tags' => []])
            ->assertOk()->assertJsonPath('data.tags', []);
    }

    public function test_the_type_of_a_memory_cannot_change(): void
    {
        $m = $this->memory($this->user, ['type' => 'note']);

        $this->patchJson("/api/v1/memories/{$m->id}", ['type' => 'idea'])
            ->assertUnprocessable()->assertJsonValidationErrors(['type']);
        $this->assertSame('note', $m->fresh()->type->value);
    }

    public function test_a_link_memory_cannot_lose_its_url(): void
    {
        $m = $this->memory($this->user, ['type' => 'link', 'source_url' => 'https://e.com']);

        $this->patchJson("/api/v1/memories/{$m->id}", ['source_url' => null])->assertUnprocessable();
        $this->patchJson("/api/v1/memories/{$m->id}", ['source_url' => 'https://other.com'])->assertOk();
    }

    public function test_a_voice_recording_can_be_replaced_and_the_old_file_is_deleted(): void
    {
        Storage::fake('local');
        $old = Attachment::factory()->create(['user_id' => $this->user->id, 'path' => 'attachments/old.m4a']);
        Storage::disk('local')->put('attachments/old.m4a', 'old');
        $id = $this->postJson('/api/v1/memories', ['type' => 'voice', 'title' => 'v', 'attachment_id' => $old->id])->json('data.id');

        $new = Attachment::factory()->create(['user_id' => $this->user->id, 'path' => 'attachments/new.m4a']);
        Storage::disk('local')->put('attachments/new.m4a', 'new');
        $this->patchJson("/api/v1/memories/{$id}", ['attachment_id' => $new->id])
            ->assertOk()->assertJsonPath('data.attachment.id', $new->id);

        $this->assertDatabaseMissing('attachments', ['id' => $old->id]);
        Storage::disk('local')->assertMissing('attachments/old.m4a');
        Storage::disk('local')->assertExists('attachments/new.m4a');
    }

    public function test_a_failed_replacement_keeps_the_old_recording(): void
    {
        Storage::fake('local');
        $old = Attachment::factory()->create(['user_id' => $this->user->id, 'path' => 'attachments/old.m4a']);
        Storage::disk('local')->put('attachments/old.m4a', 'old');
        $id = $this->postJson('/api/v1/memories', ['type' => 'voice', 'title' => 'v', 'attachment_id' => $old->id])->json('data.id');

        $this->patchJson("/api/v1/memories/{$id}", ['attachment_id' => '01ARZ3NDEKTSV4RRFFQ69G5FAV'])->assertUnprocessable();

        $this->assertDatabaseHas('attachments', ['id' => $old->id, 'memory_id' => $id]);
        Storage::disk('local')->assertExists('attachments/old.m4a');
    }

    public function test_opening_a_memory_does_not_change_updated_at(): void
    {
        $m = $this->memory($this->user, ['updated_at' => now()->subDays(3)]);
        $before = $m->fresh()->updated_at;

        $this->postJson("/api/v1/memories/{$m->id}/open")->assertOk()->assertJsonPath('data.last_opened_at', fn ($v) => $v !== null);

        $this->assertTrue($m->fresh()->updated_at->equalTo($before));
        $this->assertNotNull($m->fresh()->last_opened_at);
    }

    // ── delete / trash ───────────────────────────────────────────────────────

    public function test_delete_is_soft_and_the_memory_can_be_restored_with_everything_intact(): void
    {
        $a = $this->memory($this->user, ['title' => 'Gone']);
        $b = $this->memory($this->user);
        $this->link($this->user, $a, $b);

        $this->deleteJson("/api/v1/memories/{$a->id}")->assertNoContent();
        $this->getJson("/api/v1/memories/{$a->id}")->assertNotFound();
        $this->assertCount(1, $this->getJson('/api/v1/memories')->json('data'));
        $this->assertSame([$a->id], $this->getJson('/api/v1/memories/trashed')->json('data.*.id'));

        $this->postJson("/api/v1/memories/{$a->id}/restore")->assertOk()->assertJsonPath('data.deleted_at', null)
            ->assertJsonPath('data.linked_ids', [$b->id]);
        $this->assertCount(2, $this->getJson('/api/v1/memories')->json('data'));
    }

    public function test_only_trashed_memories_can_be_permanently_deleted(): void
    {
        Storage::fake('local');
        $m = $this->memory($this->user, ['type' => 'voice']);
        Storage::disk('local')->put('attachments/f.m4a', 'x');
        Attachment::factory()->create(['user_id' => $this->user->id, 'memory_id' => $m->id, 'path' => 'attachments/f.m4a']);

        $this->deleteJson("/api/v1/memories/{$m->id}/force")->assertStatus(409);
        $this->assertNotNull(Memory::find($m->id));

        $this->deleteJson("/api/v1/memories/{$m->id}")->assertNoContent();
        $this->deleteJson("/api/v1/memories/{$m->id}/force")->assertNoContent();

        $this->assertNull(Memory::withTrashed()->find($m->id));
        $this->assertDatabaseCount('attachments', 0);
        Storage::disk('local')->assertMissing('attachments/f.m4a'); // the file is removed with the record
    }

    public function test_restoring_a_memory_that_is_not_in_the_trash_is_harmless(): void
    {
        $m = $this->memory($this->user);
        $this->postJson("/api/v1/memories/{$m->id}/restore")->assertOk();
    }
}
