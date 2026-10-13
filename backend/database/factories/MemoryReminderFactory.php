<?php

namespace Database\Factories;

use App\Models\Memory;
use App\Models\MemoryReminder;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<MemoryReminder> */
class MemoryReminderFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => fn (array $attributes) => Memory::query()->findOrFail($attributes['memory_id'])->user_id,
            'memory_id' => Memory::factory(),
            'remind_at' => now()->addDay(),
            'delivery' => 'in-app',
        ];
    }
}
