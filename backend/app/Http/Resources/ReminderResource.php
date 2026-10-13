<?php

namespace App\Http\Resources;

use App\Models\MemoryReminder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin MemoryReminder */
class ReminderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'memory_id' => $this->memory_id,
            'remind_at' => $this->remind_at->toIso8601String(),
            'delivery' => $this->delivery,
            'notification_id' => $this->notification_id,
            'completed_at' => $this->completed_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            // Only when the list endpoint eager-loaded it: just enough to render a reminder row.
            'memory' => $this->whenLoaded('memory', fn () => ['id' => $this->memory->id, 'title' => $this->memory->title]),
        ];
    }
}
