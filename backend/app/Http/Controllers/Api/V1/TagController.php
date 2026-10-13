<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\TagResource;
use App\Models\Tag;
use App\Support\Pagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class TagController extends Controller
{
    /** The user's tags with how many live memories use each. Unused tags are hidden unless asked for. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $request->validate(['include_unused' => ['sometimes', 'boolean']]);

        $tags = $request->user()->tags()
            ->withCount('memories')
            ->when(! $request->boolean('include_unused'), fn ($q) => $q->has('memories'))
            ->orderByDesc('memories_count')->orderBy('name')
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        return TagResource::collection($tags);
    }

    public function store(Request $request): JsonResponse
    {
        $name = $this->normalizedName($request);
        $this->validateName($request, $name);

        $tag = $request->user()->tags()->create(['name' => $name]);

        return (new TagResource($tag->loadCount('memories')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Tag $tag): TagResource
    {
        $this->authorize('update', $tag);
        $name = $this->normalizedName($request);
        $this->validateName($request, $name, ignore: $tag->id);

        $tag->update(['name' => $name]);

        return new TagResource($tag->loadCount('memories'));
    }

    /** Removes the tag from every memory that has it. The memories themselves are untouched. */
    public function destroy(Tag $tag): JsonResponse
    {
        $this->authorize('delete', $tag);
        $tag->delete();

        return response()->json(null, 204);
    }

    private function normalizedName(Request $request): string
    {
        return Tag::normalize((string) $request->input('name'));
    }

    private function validateName(Request $request, string $name, ?int $ignore = null): void
    {
        validator(['name' => $name], [
            'name' => ['required', 'string', 'max:30', Rule::unique('tags', 'name')->where('user_id', $request->user()->id)->ignore($ignore)],
        ])->validate();
    }
}
