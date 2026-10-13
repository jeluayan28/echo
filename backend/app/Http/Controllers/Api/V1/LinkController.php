<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\LinkResource;
use App\Models\Memory;
use App\Models\MemoryLink;
use App\Support\Pagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Relationships between memories (the Neural Map's edges). They are undirected: linking A→B and B→A is the
 * same relationship. Both ends must be the caller's own, live (non-trashed) memories.
 */
class LinkController extends Controller
{
    /** Every edge of the caller's graph (for drawing the whole Neural Map). Edges touching trashed memories are left out. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $links = $request->user()->memoryLinks()
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('memories as a')->whereColumn('a.id', 'memory_links.from_memory_id')->whereNull('a.deleted_at'))
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('memories as b')->whereColumn('b.id', 'memory_links.to_memory_id')->whereNull('b.deleted_at'))
            ->orderBy('memory_links.id')
            ->paginate(Pagination::perPage($request, 500))
            ->withQueryString();

        return LinkResource::collection($links);
    }

    /** The links of one memory, each with the memory at the other end. */
    public function forMemory(Request $request, Memory $memory): AnonymousResourceCollection
    {
        $this->authorize('view', $memory);

        $links = $request->user()->memoryLinks()->involving($memory->id)
            ->orderBy('id')
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        // One query for all "other end" memories (not one per link). Trashed ones are skipped.
        $others = Memory::query()->summary()
            ->where('memories.user_id', $request->user()->id)
            ->whereIn('memories.id', $links->getCollection()->map->otherEnd($memory->id))
            ->get()->keyBy('id');

        $links->setCollection($links->getCollection()
            ->each(fn (MemoryLink $link) => $link->setRelation('other', $others->get($link->otherEnd($memory->id))))
            ->filter(fn (MemoryLink $link) => $link->getRelation('other') !== null)
            ->values());

        return LinkResource::collection($links);
    }

    public function store(Request $request, Memory $memory): JsonResponse
    {
        $this->authorize('update', $memory);

        $data = $request->validate([
            // exists + user_id: another user's memory is indistinguishable from a missing one (422, no leak).
            'memory_id' => [
                'required', 'string',
                Rule::exists('memories', 'id')->where('user_id', $request->user()->id)->whereNull('deleted_at'),
            ],
        ], [], ['memory_id' => 'memory']);

        if ($data['memory_id'] === $memory->id) {
            throw ValidationException::withMessages(['memory_id' => 'A memory cannot be linked to itself.']);
        }

        [$from, $to] = MemoryLink::canonical($memory->id, $data['memory_id']);

        if ($request->user()->memoryLinks()->where('from_memory_id', $from)->where('to_memory_id', $to)->exists()) {
            return response()->json(['message' => 'These memories are already linked.'], 409);
        }

        $link = $request->user()->memoryLinks()->create(['from_memory_id' => $from, 'to_memory_id' => $to]);

        return (new LinkResource($link))->response()->setStatusCode(201);
    }

    /** Removes the link between {memory} and {other}. */
    public function destroy(Request $request, Memory $memory, string $other): JsonResponse
    {
        $this->authorize('view', $memory);

        $link = MemoryLink::query()->between($memory->id, $other)->first();
        abort_if($link === null, 404);
        $this->authorize('delete', $link); // the link must be the caller's too, even if the ids were guessed

        $link->delete();

        return response()->json(null, 204);
    }
}
