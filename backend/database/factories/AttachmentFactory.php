<?php

namespace Database\Factories;

use App\Models\Attachment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Attachment> */
class AttachmentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'memory_id' => null,
            'kind' => 'audio',
            'disk' => 'local',
            'path' => 'attachments/test/'.fake()->uuid().'.m4a',
            'mime_type' => 'audio/mp4',
            'size_bytes' => 1024,
            'duration_ms' => 5000,
        ];
    }
}
