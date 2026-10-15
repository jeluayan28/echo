<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MemorySummaryResource;
use App\Semantic\EmbeddingException;
use App\Semantic\SemanticSearch;
use App\Support\Pagination;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class SearchController extends Controller
{
    public function __construct(private readonly SemanticSearch $semantic) {}

    /**
     * Full-text search over the caller's memories (title, content, tags), best match first.
     * Filters narrow the result exactly like the memory list. Never returns trashed or other users' memories.
     *
     * `mode=semantic` asks for search by meaning. It is honoured only when the whole pipeline works for this user;
     * otherwise (or if the embedding service fails right now) the normal text search answers and the response
     * says so in `search.fallback_reason`. `search.mode` always names what was ACTUALLY used.
     */
    public function __invoke(Request $request): AnonymousResourceCollection
    {
        $params = $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:200'],
            'mode' => ['sometimes', Rule::in(['text', 'semantic'])],
            'type' => ['sometimes', Rule::in(['note', 'idea', 'link', 'voice'])],
            'collection_id' => ['sometimes', 'string', 'max:26'],
            'tag' => ['sometimes', 'string', 'max:30'],
            'favorite' => ['sometimes', 'boolean'],
            'pinned' => ['sometimes', 'boolean'],
        ]);
        $user = $request->user();
        $fallback = null;

        if (($params['mode'] ?? 'text') === 'semantic') {
            $status = $this->semantic->status($user);

            if (in_array($status['state'], ['ready', 'indexing'], true)) {
                try {
                    $vector = $this->semantic->embedQuery($params['q']);

                    $results = $this->semantic->nearest($user->memories()->summary()->filter($params), $user->id, $vector)
                        ->paginate(Pagination::perPage($request))
                        ->withQueryString();

                    return MemorySummaryResource::collection($results)->additional([
                        'search' => ['mode' => 'semantic', 'complete' => $status['state'] === 'ready', 'fallback_reason' => null],
                    ]);
                } catch (EmbeddingException) {
                    $fallback = 'provider_error';
                }
            } else {
                $fallback = $status['state'] === 'off' ? 'not_enabled' : ($status['reason'] ?? 'unavailable');
            }
        }

        $results = $user->memories()
            ->summary()
            ->filter($params)
            ->search($params['q'], $user->id)
            ->orderBy('memories.id')
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        return MemorySummaryResource::collection($results)->additional([
            'search' => ['mode' => 'text', 'complete' => true, 'fallback_reason' => $fallback],
        ]);
    }
}
