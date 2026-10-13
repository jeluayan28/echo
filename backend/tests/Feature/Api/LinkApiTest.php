<?php

namespace Tests\Feature\Api;

use App\Models\MemoryLink;
use App\Models\User;

class LinkApiTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    public function test_two_memories_can_be_linked(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);

        $response = $this->postJson("/api/v1/memories/{$a->id}/links", ['memory_id' => $b->id])
            ->assertCreated()->assertJsonStructure(['data' => ['id', 'from_memory_id', 'to_memory_id', 'created_at']]);

        $this->assertEqualsCanonicalizing([$a->id, $b->id], [$response->json('data.from_memory_id'), $response->json('data.to_memory_id')]);
        $this->getJson("/api/v1/memories/{$a->id}")->assertJsonPath('data.linked_ids', [$b->id]);
        $this->getJson("/api/v1/memories/{$b->id}")->assertJsonPath('data.linked_ids', [$a->id]); // undirected
    }

    public function test_a_memory_cannot_be_linked_to_itself(): void
    {
        $a = $this->memory($this->user);

        $this->postJson("/api/v1/memories/{$a->id}/links", ['memory_id' => $a->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['memory_id']);
        $this->assertDatabaseCount('memory_links', 0);
    }

    public function test_a_relationship_cannot_be_created_twice_in_either_direction(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);

        $this->postJson("/api/v1/memories/{$a->id}/links", ['memory_id' => $b->id])->assertCreated();
        $this->postJson("/api/v1/memories/{$a->id}/links", ['memory_id' => $b->id])->assertStatus(409);
        $this->postJson("/api/v1/memories/{$b->id}/links", ['memory_id' => $a->id])->assertStatus(409);

        $this->assertDatabaseCount('memory_links', 1);
    }

    public function test_both_ends_must_be_the_callers_own_memories(): void
    {
        $mine = $this->memory($this->user);
        $theirs = $this->memory(User::factory()->create());

        // target belongs to someone else: looks exactly like a missing memory
        $this->postJson("/api/v1/memories/{$mine->id}/links", ['memory_id' => $theirs->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['memory_id']);
        $this->postJson("/api/v1/memories/{$mine->id}/links", ['memory_id' => '01ARZ3NDEKTSV4RRFFQ69G5FAV'])
            ->assertUnprocessable()->assertJsonValidationErrors(['memory_id']);
        // source belongs to someone else
        $this->postJson("/api/v1/memories/{$theirs->id}/links", ['memory_id' => $mine->id])->assertNotFound();

        $this->assertDatabaseCount('memory_links', 0);
    }

    public function test_a_memory_in_the_trash_cannot_be_linked(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);
        $b->delete();

        $this->postJson("/api/v1/memories/{$a->id}/links", ['memory_id' => $b->id])->assertUnprocessable();
    }

    public function test_the_target_is_required(): void
    {
        $a = $this->memory($this->user);
        $this->postJson("/api/v1/memories/{$a->id}/links", [])->assertUnprocessable()->assertJsonValidationErrors(['memory_id']);
    }

    public function test_a_link_can_be_removed_from_either_end(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);
        $this->link($this->user, $a, $b);

        $this->deleteJson("/api/v1/memories/{$b->id}/links/{$a->id}")->assertNoContent();

        $this->assertDatabaseCount('memory_links', 0);
        $this->assertNotNull($a->fresh());
        $this->deleteJson("/api/v1/memories/{$b->id}/links/{$a->id}")->assertNotFound(); // already gone
    }

    public function test_a_memory_lists_its_links_with_the_memory_at_the_other_end(): void
    {
        $a = $this->memory($this->user, ['title' => 'Center']);
        $b = $this->memory($this->user, ['title' => 'Right']);
        $c = $this->memory($this->user, ['title' => 'Trashed']);
        $this->memory($this->user, ['title' => 'Unrelated']);
        $this->link($this->user, $a, $b);
        $this->link($this->user, $c, $a);
        $c->delete();

        $rows = $this->getJson("/api/v1/memories/{$a->id}/links")->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame('Right', $rows[0]['memory']['title']);
        $this->assertArrayNotHasKey('body', $rows[0]['memory']);
    }

    public function test_the_graph_endpoint_returns_every_edge_between_live_memories(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);
        $c = $this->memory($this->user);
        $this->link($this->user, $a, $b);
        $this->link($this->user, $b, $c);
        $c->delete();

        $this->getJson('/api/v1/links')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/links?per_page=100000')->assertJsonPath('meta.per_page', 500);

        $c->restore(); // Undo brings the edge back
        $this->getJson('/api/v1/links')->assertJsonCount(2, 'data');
    }

    public function test_the_graph_only_contains_the_callers_edges(): void
    {
        $other = User::factory()->create();
        $this->link($other, $this->memory($other), $this->memory($other));
        $this->link($this->user, $this->memory($this->user), $this->memory($this->user));

        $this->getJson('/api/v1/links')->assertJsonCount(1, 'data');
        $this->assertDatabaseCount('memory_links', 2);
    }

    public function test_link_listing_does_not_run_n_plus_one_queries(): void
    {
        $hub = $this->memory($this->user);
        foreach (range(1, 3) as $_) {
            $this->link($this->user, $hub, $this->memory($this->user));
        }
        $few = $this->queryCount(fn () => $this->getJson("/api/v1/memories/{$hub->id}/links")->assertOk());
        foreach (range(1, 15) as $_) {
            $this->link($this->user, $hub, $this->memory($this->user));
        }
        $many = $this->queryCount(fn () => $this->getJson("/api/v1/memories/{$hub->id}/links")->assertOk());

        $this->assertSame($few, $many);
    }

    public function test_soft_deleting_keeps_links_so_undo_restores_them(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);
        $this->link($this->user, $a, $b);

        $this->deleteJson("/api/v1/memories/{$a->id}")->assertNoContent();
        $this->assertDatabaseCount('memory_links', 1);

        $this->postJson("/api/v1/memories/{$a->id}/restore")->assertOk()->assertJsonPath('data.linked_ids', [$b->id]);
    }

    public function test_permanently_deleting_a_memory_removes_its_links(): void
    {
        $a = $this->memory($this->user);
        $b = $this->memory($this->user);
        $this->link($this->user, $a, $b);

        $this->deleteJson("/api/v1/memories/{$a->id}");
        $this->deleteJson("/api/v1/memories/{$a->id}/force")->assertNoContent();

        $this->assertDatabaseCount('memory_links', 0);
        $this->assertSame(0, MemoryLink::count());
        $this->getJson("/api/v1/memories/{$b->id}")->assertOk()->assertJsonPath('data.linked_ids', []);
    }
}
