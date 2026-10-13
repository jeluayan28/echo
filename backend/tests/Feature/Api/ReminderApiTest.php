<?php

namespace Tests\Feature\Api;

use App\Models\MemoryReminder;
use App\Models\User;

class ReminderApiTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    private function at(string $when): string
    {
        return now()->modify($when)->toIso8601String();
    }

    public function test_a_reminder_can_be_set_read_and_removed(): void
    {
        $m = $this->memory($this->user);

        $this->putJson("/api/v1/memories/{$m->id}/reminder", [
            'remind_at' => $this->at('+1 day'), 'delivery' => 'notification', 'notification_id' => 'device-abc',
        ])->assertCreated()
            ->assertJsonPath('data.memory_id', $m->id)
            ->assertJsonPath('data.delivery', 'notification')
            ->assertJsonPath('data.notification_id', 'device-abc')
            ->assertJsonPath('data.completed_at', null)
            ->assertJsonMissingPath('data.user_id');

        $this->getJson("/api/v1/memories/{$m->id}/reminder")->assertOk()->assertJsonPath('data.delivery', 'notification');
        $this->getJson("/api/v1/memories/{$m->id}")->assertJsonPath('data.reminder.notification_id', 'device-abc');

        $this->deleteJson("/api/v1/memories/{$m->id}/reminder")->assertNoContent();
        $this->getJson("/api/v1/memories/{$m->id}/reminder")->assertNotFound();
        $this->deleteJson("/api/v1/memories/{$m->id}/reminder")->assertNotFound();
    }

    public function test_setting_a_reminder_again_replaces_it_there_is_only_one_per_memory(): void
    {
        $m = $this->memory($this->user);

        $this->putJson("/api/v1/memories/{$m->id}/reminder", ['remind_at' => $this->at('+1 day')])->assertCreated();
        $this->putJson("/api/v1/memories/{$m->id}/reminder", ['remind_at' => $this->at('+3 days'), 'delivery' => 'notification', 'notification_id' => 'new'])
            ->assertOk()->assertJsonPath('data.notification_id', 'new');

        $this->assertDatabaseCount('memory_reminders', 1);
    }

    public function test_the_delivery_defaults_to_in_app_and_is_validated(): void
    {
        $m = $this->memory($this->user);

        $this->putJson("/api/v1/memories/{$m->id}/reminder", ['remind_at' => $this->at('+1 day')])->assertJsonPath('data.delivery', 'in-app');
        $this->putJson("/api/v1/memories/{$m->id}/reminder", ['remind_at' => $this->at('+1 day'), 'delivery' => 'carrier-pigeon'])
            ->assertUnprocessable()->assertJsonValidationErrors(['delivery']);
    }

    public function test_the_time_must_be_valid_and_in_the_future(): void
    {
        $m = $this->memory($this->user);

        $this->putJson("/api/v1/memories/{$m->id}/reminder", [])->assertUnprocessable()->assertJsonValidationErrors(['remind_at']);
        $this->putJson("/api/v1/memories/{$m->id}/reminder", ['remind_at' => 'tomorrow-ish-maybe'])->assertUnprocessable();
        $this->putJson("/api/v1/memories/{$m->id}/reminder", ['remind_at' => $this->at('-1 minute')])->assertUnprocessable()->assertJsonValidationErrors(['remind_at']);
        $this->assertDatabaseCount('memory_reminders', 0);
    }

    public function test_opening_a_memory_after_its_reminder_is_due_completes_the_reminder(): void
    {
        $m = $this->memory($this->user);
        MemoryReminder::factory()->create(['memory_id' => $m->id, 'remind_at' => now()->subHour()]);
        $upcoming = $this->memory($this->user);
        MemoryReminder::factory()->create(['memory_id' => $upcoming->id, 'remind_at' => now()->addDay()]);

        $this->postJson("/api/v1/memories/{$m->id}/open")->assertOk();
        $this->postJson("/api/v1/memories/{$upcoming->id}/open")->assertOk();

        $this->assertNotNull(MemoryReminder::where('memory_id', $m->id)->first()->completed_at);
        $this->assertNull(MemoryReminder::where('memory_id', $upcoming->id)->first()->completed_at); // not due yet
    }

    public function test_a_new_time_rearms_a_completed_reminder(): void
    {
        $m = $this->memory($this->user);
        MemoryReminder::factory()->create(['memory_id' => $m->id, 'remind_at' => now()->subHour(), 'completed_at' => now()]);

        $this->putJson("/api/v1/memories/{$m->id}/reminder", ['remind_at' => $this->at('+2 days')])->assertOk()->assertJsonPath('data.completed_at', null);
    }

    public function test_a_reminder_can_be_marked_complete_by_id(): void
    {
        $m = $this->memory($this->user);
        $r = MemoryReminder::factory()->create(['memory_id' => $m->id]);

        $this->postJson("/api/v1/reminders/{$r->id}/complete")->assertOk()->assertJson(fn ($j) => $j->where('data.completed_at', fn ($v) => $v !== null)->etc());
    }

    public function test_the_list_filters_by_status_and_skips_trashed_memories(): void
    {
        $upcoming = $this->memory($this->user, ['title' => 'Upcoming']);
        $due = $this->memory($this->user, ['title' => 'Due']);
        $done = $this->memory($this->user, ['title' => 'Done']);
        $gone = $this->memory($this->user, ['title' => 'Trashed']);
        MemoryReminder::factory()->create(['memory_id' => $upcoming->id, 'remind_at' => now()->addDay()]);
        MemoryReminder::factory()->create(['memory_id' => $due->id, 'remind_at' => now()->subDay()]);
        MemoryReminder::factory()->create(['memory_id' => $done->id, 'remind_at' => now()->subDays(2), 'completed_at' => now()]);
        MemoryReminder::factory()->create(['memory_id' => $gone->id, 'remind_at' => now()->addDays(2)]);
        $gone->delete();

        $titles = fn (string $qs = '') => $this->getJson("/api/v1/reminders{$qs}")->assertOk()->json('data.*.memory.title');

        $this->assertSame(['Done', 'Due', 'Upcoming'], $titles()); // soonest first, trashed memory excluded
        $this->assertSame(['Upcoming'], $titles('?status=upcoming'));
        $this->assertSame(['Due'], $titles('?status=due'));
        $this->assertSame(['Done'], $titles('?status=completed'));
        $this->getJson('/api/v1/reminders?status=bogus')->assertUnprocessable();
    }

    public function test_the_list_does_not_run_n_plus_one_queries(): void
    {
        foreach (range(1, 3) as $_) {
            MemoryReminder::factory()->create(['memory_id' => $this->memory($this->user)->id]);
        }
        $few = $this->queryCount(fn () => $this->getJson('/api/v1/reminders')->assertOk());
        foreach (range(1, 15) as $_) {
            MemoryReminder::factory()->create(['memory_id' => $this->memory($this->user)->id]);
        }
        $many = $this->queryCount(fn () => $this->getJson('/api/v1/reminders')->assertOk());

        $this->assertSame($few, $many);
    }

    public function test_permanently_deleting_a_memory_removes_its_reminder(): void
    {
        $m = $this->memory($this->user);
        MemoryReminder::factory()->create(['memory_id' => $m->id]);

        $this->deleteJson("/api/v1/memories/{$m->id}");
        $this->assertDatabaseCount('memory_reminders', 1); // Undo can bring it back
        $this->deleteJson("/api/v1/memories/{$m->id}/force");
        $this->assertDatabaseCount('memory_reminders', 0);
    }
}
