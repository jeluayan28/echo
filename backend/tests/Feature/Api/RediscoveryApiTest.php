<?php

namespace Tests\Feature\Api;

use App\Models\User;

class RediscoveryApiTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    public function test_a_snooze_and_a_dismissal_are_stored_and_listed(): void
    {
        $m = $this->memory($this->user);

        $this->putJson("/api/v1/memories/{$m->id}/rediscovery", ['snoozed_until' => '2030-01-01T00:00:00Z'])
            ->assertOk()->assertJsonPath('data.memory_id', $m->id)->assertJsonPath('data.dismissed_at', null);
        $this->putJson("/api/v1/memories/{$m->id}/rediscovery", ['dismissed_at' => '2029-12-01T00:00:00Z'])
            ->assertOk()->assertJsonPath('data.snoozed_until', fn ($v) => str_starts_with($v, '2030-01-01'));

        $this->assertDatabaseCount('rediscovery_states', 1);
        $this->getJson('/api/v1/rediscovery')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.memory_id', $m->id);
    }

    public function test_a_null_clears_a_choice(): void
    {
        $m = $this->memory($this->user);
        $this->putJson("/api/v1/memories/{$m->id}/rediscovery", ['snoozed_until' => '2030-01-01T00:00:00Z'])->assertOk();

        $this->putJson("/api/v1/memories/{$m->id}/rediscovery", ['snoozed_until' => null])
            ->assertOk()->assertJsonPath('data.snoozed_until', null);
    }

    public function test_dates_are_validated(): void
    {
        $m = $this->memory($this->user);
        $this->putJson("/api/v1/memories/{$m->id}/rediscovery", ['snoozed_until' => 'not a date'])->assertUnprocessable();
    }

    public function test_it_is_private_to_the_owner(): void
    {
        $other = User::factory()->create();
        $theirs = $this->memory($other);

        $this->putJson("/api/v1/memories/{$theirs->id}/rediscovery", ['snoozed_until' => '2030-01-01T00:00:00Z'])->assertNotFound();

        $mine = $this->memory($this->user);
        $this->putJson("/api/v1/memories/{$mine->id}/rediscovery", ['snoozed_until' => '2030-01-01T00:00:00Z'])->assertOk();
        $this->as($other);
        $this->getJson('/api/v1/rediscovery')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_it_requires_authentication(): void
    {
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/rediscovery')->assertUnauthorized();
    }
}
