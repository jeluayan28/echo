<?php

namespace App\Http\Resources;

use App\Models\Memory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Full representation of ONE memory (detail screen, create/update responses).
 * The owner's `user_id` is never exposed.
 *
 * @mixin Memory
 */
class MemoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'title' => $this->title,
            'body' => $this->body ?? '',
            'source_url' => $this->source_url,
            'favorite' => $this->favorite,
            'pinned' => $this->pinned,
            'collection_id' => $this->collection_id,
            'tags' => $this->tags->pluck('name')->values(),
            // Ids of the memories this one is linked to (set by MemoryController).
            'linked_ids' => $this->resource->getAttribute('linked_ids') ?? [],
            'attachment' => AttachmentResource::make($this->attachment),
            'reminder' => ReminderResource::make($this->whenLoaded('reminder')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'last_opened_at' => $this->last_opened_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
        ];
    }
}
