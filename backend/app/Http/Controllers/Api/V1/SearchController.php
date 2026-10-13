<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MemorySummaryResource;
use App\Support\Pagination;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class SearchController extends Controller
{
    /**
     * Full-text search over the caller's memories (title, content, tags), best match first.
     * Filters narrow the result exactly like the memory list. Never returns trashed or other users' memories.
     */
    public function __invoke(Request $request): AnonymousResourceCollection
    {
        $params = $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:200'],
            'type' => ['sometimes', Rule::in(['note', 'idea', 'link', 'voice'])],
            'collection_id' => ['sometimes', 'string', 'max:26'],
            'tag' => ['sometimes', 'string', 'max:30'],
            'favorite' => ['sometimes', 'boolean'],
            'pinned' => ['sometimes', 'boolean'],
        ]);

        $results = $request->user()->memories()
            ->summary()
            ->filter($params)
            ->search($params['q'], $request->user()->id)
            ->orderBy('memories.id')
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        return MemorySummaryResource::collection($results);
    }
}
