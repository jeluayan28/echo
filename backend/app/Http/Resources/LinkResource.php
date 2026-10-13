<?php

namespace App\Http\Resources;

use App\Models\MemoryLink;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A relationship between two memories. In the graph listing it is a bare edge; under a memory it also carries
 * the memory at the OTHER end (`memory`), attached by the controller in a single extra query.
 *
 * @mixin MemoryLink
 */
class LinkResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $other = $this->resource->getRelationValue('other');

        return [
            'id' => $this->id,
            'from_memory_id' => $this->from_memory_id,
            'to_memory_id' => $this->to_memory_id,
            'memory' => $this->when($other !== null, fn () => new MemorySummaryResource($other)),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
