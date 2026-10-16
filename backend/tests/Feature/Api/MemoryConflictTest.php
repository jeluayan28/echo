<?php

namespace Tests\Feature\Api;

use App\Models\User;

class MemoryConflictTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    public function test_an_edit_based_on_the_current_version_is_applied(): void
    {
        $memory = $this->memory($this->user, ['title' => 'Old', 'updated_at' => now()->subDay()]);
        $base = $memory->fresh()->updated_at->toIso8601String();

        $this->patchJson("/api/v1/memories/{$memory->id}", ['title' => 'New', 'base_updated_at' => $base])
            ->assertOk()->assertJsonPath('data.title', 'New')->assertJsonMissingPath('data.base_updated_at');
        $this->assertSame('New', $memory->fresh()->title);
    }

    public function test_an_edit_based_on_an_older_version_is_refused_and_returns_the_current_copy(): void
    {
        $memory = $this->memory($this->user, ['title' => 'Server', 'body' => 'Newer text', 'updated_at' => now()]);
        $stale = now()->subHour()->toIso8601String();

        $this->patchJson("/api/v1/memories/{$memory->id}", ['title' => 'Mine', 'body' => 'Mine', 'base_updated_at' => $stale])
            ->assertStatus(409)
            ->assertJsonPath('code', 'conflict')
            ->assertJsonPath('current.id', $memory->id)
            ->assertJsonPath('current.title', 'Server')
            ->assertJsonPath('current.body', 'Newer text');

        $fresh = $memory->fresh();
        $this->assertSame('Server', $fresh->title);
        $this->assertSame('Newer text', $fresh->body);
    }

    public function test_tags_and_other_changes_are_not_applied_on_a_conflict(): void
    {
        $memory = $this->memory($this->user, ['updated_at' => now()]);

        $this->patchJson("/api/v1/memories/{$memory->id}", ['tags' => ['sneaky'], 'favorite' => true, 'base_updated_at' => now()->subDay()->toIso8601String()])
            ->assertStatus(409);

        $this->assertSame(0, $memory->tags()->count());
        $this->assertFalse($memory->fresh()->favorite);
    }

    public function test_without_a_base_version_updates_behave_as_before(): void
    {
        $memory = $this->memory($this->user, ['updated_at' => now()->subDay()]);

        $this->patchJson("/api/v1/memories/{$memory->id}", ['title' => 'Unconditional'])->assertOk();
    }

    public function test_the_base_version_must_be_a_date_and_is_not_accepted_on_create(): void
    {
        $memory = $this->memory($this->user);

        $this->patchJson("/api/v1/memories/{$memory->id}", ['title' => 'x', 'base_updated_at' => 'nonsense'])
            ->assertUnprocessable()->assertJsonValidationErrors(['base_updated_at']);
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'base_updated_at' => now()->toIso8601String()])
            ->assertUnprocessable()->assertJsonValidationErrors(['base_updated_at']);
    }

    public function test_someone_elses_memory_is_still_not_found_not_conflicted(): void
    {
        $other = $this->memory(User::factory()->create(), ['updated_at' => now()]);

        $this->patchJson("/api/v1/memories/{$other->id}", ['title' => 'x', 'base_updated_at' => now()->subDay()->toIso8601String()])
            ->assertNotFound();
    }
}
