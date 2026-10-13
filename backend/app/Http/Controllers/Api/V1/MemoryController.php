<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\MemoryRequest;
use App\Http\Resources\MemoryResource;
use App\Http\Resources\MemorySummaryResource;
use App\Models\Memory;
use App\Models\MemoryLink;
use App\Models\MemoryReminder;
use App\Services\MemoryWriter;
use App\Support\Pagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class MemoryController extends Controller
{
    /** Columns clients may sort by (whitelist: the value ends up in an ORDER BY). */
    private const SORTABLE = ['created_at', 'updated_at', 'last_opened_at', 'title'];

    public function __construct(private readonly MemoryWriter $writer) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'type' => ['sometimes', Rule::in(['note', 'idea', 'link', 'voice'])],
            'collection_id' => ['sometimes', 'string', 'max:26'], // a collection id, or "none"
            'tag' => ['sometimes', 'string', 'max:30'],
            'favorite' => ['sometimes', 'boolean'],
            'pinned' => ['sometimes', 'boolean'],
            'updated_since' => ['sometimes', 'date'], // incremental sync
            'sort' => ['sometimes', Rule::in(self::SORTABLE)],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
        ]);

        $memories = $request->user()->memories()
            ->summary()
            ->filter($filters)
            ->when($filters['updated_since'] ?? null, fn ($q, $since) => $q->where('memories.updated_at', '>', $since))
            ->orderBy('memories.'.($filters['sort'] ?? 'created_at'), $filters['direction'] ?? 'desc')
            ->orderBy('memories.id') // stable pagination when the sort column ties
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        return MemorySummaryResource::collection($memories);
    }

    public function store(MemoryRequest $request): JsonResponse
    {
        $memory = $this->writer->create($request->user(), $request->validated());

        return (new MemoryResource($this->detail($memory)))->response()->setStatusCode(201);
    }

    public function show(Memory $memory): MemoryResource
    {
        $this->authorize('view', $memory);

        return new MemoryResource($this->detail($memory));
    }

    public function update(MemoryRequest $request, Memory $memory): MemoryResource
    {
        $this->authorize('update', $memory);

        return new MemoryResource($this->detail($this->writer->update($memory, $request->validated())));
    }

    /** Soft delete: the memory goes to the trash (with its links, tags and reminder intact) and can be restored. */
    public function destroy(Memory $memory): JsonResponse
    {
        $this->authorize('delete', $memory);
        $memory->delete();

        return response()->json(null, 204);
    }

    /** Records that the memory was opened ("Continue exploring"). Not an edit: updated_at is untouched. */
    public function open(Memory $memory): MemoryResource
    {
        $this->authorize('update', $memory);

        // withoutTimestamps (not `$memory->timestamps = false`, which would also stop created_at/updated_at being cast).
        Memory::withoutTimestamps(fn () => $memory->forceFill(['last_opened_at' => now()])->save());

        // Opening a memory after its reminder was due fulfils that reminder.
        MemoryReminder::query()->where('memory_id', $memory->id)->whereNull('completed_at')
            ->where('remind_at', '<=', now())->update(['completed_at' => now()]);

        return new MemoryResource($this->detail($memory));
    }

    // ── trash ────────────────────────────────────────────────────────────────

    public function trashed(Request $request): AnonymousResourceCollection
    {
        $memories = $request->user()->memories()->onlyTrashed()
            ->summary()
            ->orderByDesc('memories.deleted_at')->orderBy('memories.id')
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        return MemorySummaryResource::collection($memories);
    }

    public function restore(Memory $memory): MemoryResource
    {
        $this->authorize('restore', $memory);
        $memory->restore();

        return new MemoryResource($this->detail($memory));
    }

    /** Permanently deletes a memory that is already in the trash (rows and stored files). */
    public function forceDestroy(Memory $memory): JsonResponse
    {
        $this->authorize('forceDelete', $memory);

        if (! $memory->trashed()) {
            return response()->json(['message' => 'Only memories in the trash can be permanently deleted.'], 409);
        }

        $memory->forceDelete();

        return response()->json(null, 204);
    }

    /** Loads everything the detail representation needs in a fixed number of queries. */
    private function detail(Memory $memory): Memory
    {
        $memory->load(['tags:id,name', 'attachment', 'reminder']);
        $otherIds = MemoryLink::query()->involving($memory->id)
            ->get(['from_memory_id', 'to_memory_id'])
            ->map->otherEnd($memory->id);
        // Links to trashed memories stay stored (so Undo restores them) but are not shown.
        $memory->setAttribute('linked_ids', Memory::query()->whereIn('id', $otherIds)->orderBy('id')->pluck('id')->all());

        return $memory;
    }
}
