<?php

namespace App\Http\Resources;

use App\Models\Memory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * List/search representation: a short `excerpt` instead of the full body, so listing 100 memories never
 * ships 100 full documents. Requires the `Memory::summary()` scope (excerpt + link_count) and eager-loaded
 * `tags` and `attachment`; lazy loading is disabled outside production so a missing eager load is a test failure.
 *
 * @mixin Memory
 */
class MemorySummaryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'title' => $this->title,
            'excerpt' => $this->excerpt,
            'source_url' => $this->source_url,
            'favorite' => $this->favorite,
            'pinned' => $this->pinned,
            'collection_id' => $this->collection_id,
            'tags' => $this->tags->pluck('name')->values(),
            'link_count' => (int) ($this->link_count ?? 0),
            'attachment' => AttachmentResource::make($this->attachment),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'last_opened_at' => $this->last_opened_at?->toIso8601String(),
            'deleted_at' => $this->deleted_at?->toIso8601String(),
        ];
    }
}
