<?php

namespace Database\Factories;

use App\Models\Memory;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Memory> */
class MemoryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type' => 'note',
            'title' => rtrim(fake()->sentence(4), '.'),
            'body' => fake()->paragraph(),
            'favorite' => false,
            'pinned' => false,
        ];
    }

    public function forUser(User $user): static
    {
        return $this->state(['user_id' => $user->id]);
    }
}
