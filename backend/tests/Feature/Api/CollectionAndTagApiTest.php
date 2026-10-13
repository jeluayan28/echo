<?php

namespace Tests\Feature\Api;

use App\Models\Memory;
use App\Models\Tag;
use App\Models\User;

class CollectionAndTagApiTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    // ── collections ──────────────────────────────────────────────────────────

    public function test_collections_support_crud(): void
    {
        $id = $this->postJson('/api/v1/collections', ['name' => 'Reading', 'description' => 'Articles'])
            ->assertCreated()->assertJsonPath('data.memories_count', 0)->assertJsonMissingPath('data.user_id')->json('data.id');

        $this->getJson("/api/v1/collections/{$id}")->assertOk()->assertJsonPath('data.name', 'Reading');
        $this->patchJson("/api/v1/collections/{$id}", ['name' => 'Papers'])->assertOk()->assertJsonPath('data.name', 'Papers')
            ->assertJsonPath('data.description', 'Articles');
        $this->getJson('/api/v1/collections')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1);
        $this->deleteJson("/api/v1/collections/{$id}")->assertNoContent();
        $this->getJson("/api/v1/collections/{$id}")->assertNotFound();
    }

    public function test_collections_are_validated(): void
    {
        $this->postJson('/api/v1/collections', [])->assertUnprocessable()->assertJsonValidationErrors(['name']);
        $this->postJson('/api/v1/collections', ['name' => str_repeat('a', 61)])->assertUnprocessable();
        $this->postJson('/api/v1/collections', ['name' => 'ok', 'description' => str_repeat('a', 201)])->assertUnprocessable();
        $this->postJson('/api/v1/collections', ['name' => '   '])->assertUnprocessable();
    }

    public function test_the_member_count_excludes_trashed_memories(): void
    {
        $c = $this->user->collections()->create(['name' => 'C']);
        $this->memory($this->user, ['collection_id' => $c->id]);
        $this->memory($this->user, ['collection_id' => $c->id])->delete();

        $this->getJson("/api/v1/collections/{$c->id}")->assertJsonPath('data.memories_count', 1);
    }

    public function test_deleting_a_collection_keeps_its_memories(): void
    {
        $c = $this->user->collections()->create(['name' => 'C']);
        $m = $this->memory($this->user, ['collection_id' => $c->id]);

        $this->deleteJson("/api/v1/collections/{$c->id}")->assertNoContent();

        $this->getJson("/api/v1/memories/{$m->id}")->assertOk()->assertJsonPath('data.collection_id', null);
    }

    public function test_the_collection_list_does_not_run_n_plus_one_queries(): void
    {
        $this->user->collections()->createMany(array_map(fn ($i) => ['name' => "c{$i}"], range(1, 3)));
        $few = $this->queryCount(fn () => $this->getJson('/api/v1/collections')->assertOk());
        $this->user->collections()->createMany(array_map(fn ($i) => ['name' => "d{$i}"], range(1, 20)));
        $many = $this->queryCount(fn () => $this->getJson('/api/v1/collections')->assertOk());

        $this->assertSame($few, $many);
    }

    // ── tags ─────────────────────────────────────────────────────────────────

    public function test_tags_list_counts_live_memories_and_hides_unused_tags(): void
    {
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'a', 'tags' => ['product', 'ux']]);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'b', 'tags' => ['product']]);
        $trashed = $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'c', 'tags' => ['ghost']])->json('data.id');
        $this->deleteJson("/api/v1/memories/{$trashed}");
        $this->user->tags()->create(['name' => 'unused']);

        $rows = $this->getJson('/api/v1/tags')->assertOk()->json('data');
        $this->assertSame(['product' => 2, 'ux' => 1], collect($rows)->pluck('memories_count', 'name')->all());

        $all = $this->getJson('/api/v1/tags?include_unused=1')->json('data.*.name');
        $this->assertEqualsCanonicalizing(['product', 'ux', 'ghost', 'unused'], $all);
    }

    public function test_a_tag_can_be_created_renamed_and_deleted(): void
    {
        $id = $this->postJson('/api/v1/tags', ['name' => '  #Research '])->assertCreated()->assertJsonPath('data.name', 'research')->json('data.id');
        $this->postJson('/api/v1/tags', ['name' => 'RESEARCH'])->assertUnprocessable()->assertJsonValidationErrors(['name']);

        $this->patchJson("/api/v1/tags/{$id}", ['name' => 'Papers'])->assertOk()->assertJsonPath('data.name', 'papers');
        $other = $this->user->tags()->create(['name' => 'taken']);
        $this->patchJson("/api/v1/tags/{$id}", ['name' => 'taken'])->assertUnprocessable();
        $this->patchJson("/api/v1/tags/{$id}", ['name' => 'papers'])->assertOk(); // renaming to itself is fine

        $this->deleteJson("/api/v1/tags/{$id}")->assertNoContent();
        $this->assertDatabaseMissing('tags', ['id' => $id]);
        $this->assertDatabaseHas('tags', ['id' => $other->id]);
    }

    public function test_deleting_a_tag_untags_memories_but_keeps_them(): void
    {
        $m = $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'a', 'tags' => ['x', 'y']])->json('data.id');
        $tag = $this->user->tags()->where('name', 'x')->first();

        $this->deleteJson("/api/v1/tags/{$tag->id}")->assertNoContent();

        $this->getJson("/api/v1/memories/{$m}")->assertOk()->assertJsonPath('data.tags', ['y']);
    }

    public function test_tag_names_are_validated(): void
    {
        $this->postJson('/api/v1/tags', ['name' => ''])->assertUnprocessable();
        $this->postJson('/api/v1/tags', ['name' => '#'])->assertUnprocessable();
        $this->postJson('/api/v1/tags', ['name' => str_repeat('a', 31)])->assertUnprocessable();
    }

    public function test_two_users_can_have_the_same_tag_name_without_seeing_each_other(): void
    {
        $other = User::factory()->create();
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'mine', 'tags' => ['shared']]);
        $this->as($other)->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'theirs', 'tags' => ['shared', 'secret']]);

        $this->as($this->user)->getJson('/api/v1/tags')->assertJsonCount(1, 'data');
        $this->assertSame(['shared', 'secret'], collect($this->as($other)->getJson('/api/v1/tags?per_page=10')->json('data'))->pluck('name')->sortByDesc(fn ($n) => $n === 'shared')->values()->all());
        $this->assertSame(2, Tag::where('name', 'shared')->count());
        $this->assertSame(1, Memory::where('user_id', $this->user->id)->count());
    }
}
