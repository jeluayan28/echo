<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CollectionResource;
use App\Models\Collection;
use App\Support\Pagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CollectionController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $collections = $request->user()->collections()
            ->withCount('memories') // live (non-trashed) memories only: the soft-delete scope applies
            ->orderBy('name')->orderBy('id')
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        return CollectionResource::collection($collections);
    }

    public function store(Request $request): JsonResponse
    {
        $collection = $request->user()->collections()->create($this->validated($request));

        return (new CollectionResource($collection->loadCount('memories')))->response()->setStatusCode(201);
    }

    public function show(Collection $collection): CollectionResource
    {
        $this->authorize('view', $collection);

        return new CollectionResource($collection->loadCount('memories'));
    }

    public function update(Request $request, Collection $collection): CollectionResource
    {
        $this->authorize('update', $collection);
        $collection->update($this->validated($request, partial: true));

        return new CollectionResource($collection->loadCount('memories'));
    }

    /** Deleting a collection NEVER deletes its memories: they become uncollected (enforced by the database). */
    public function destroy(Collection $collection): JsonResponse
    {
        $this->authorize('delete', $collection);
        $collection->delete();

        return response()->json(null, 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $presence = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$presence, 'string', 'max:60', 'regex:/\S/u'],
            'description' => ['sometimes', 'nullable', 'string', 'max:200'],
        ]);
    }
}
