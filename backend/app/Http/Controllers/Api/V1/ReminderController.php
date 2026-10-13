<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReminderResource;
use App\Models\Memory;
use App\Models\MemoryReminder;
use App\Support\Pagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

/**
 * A reminder is a record that a memory should resurface at a time. The server stores WHAT and WHEN, plus what
 * the device arranged (`delivery`, `notification_id`); the notification itself is scheduled on the device and
 * is best-effort — the API makes no promise that it is shown.
 */
class ReminderController extends Controller
{
    /** The caller's reminders, soonest first. `status`: upcoming | due | completed. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $params = $request->validate([
            'status' => ['sometimes', Rule::in(['upcoming', 'due', 'completed'])],
            'memory_id' => ['sometimes', 'string', 'max:26'],
        ]);

        $reminders = $request->user()->reminders()
            ->whereHas('memory') // not for memories in the trash
            ->with('memory:id,title')
            ->when($params['memory_id'] ?? null, fn ($q, $id) => $q->where('memory_id', $id))
            ->when(($params['status'] ?? null) === 'upcoming', fn ($q) => $q->whereNull('completed_at')->where('remind_at', '>', now()))
            ->when(($params['status'] ?? null) === 'due', fn ($q) => $q->whereNull('completed_at')->where('remind_at', '<=', now()))
            ->when(($params['status'] ?? null) === 'completed', fn ($q) => $q->whereNotNull('completed_at'))
            ->orderBy('remind_at')->orderBy('id')
            ->paginate(Pagination::perPage($request))
            ->withQueryString();

        return ReminderResource::collection($reminders);
    }

    public function show(Memory $memory): ReminderResource
    {
        $this->authorize('view', $memory);

        return new ReminderResource($this->reminderOf($memory));
    }

    /** Creates or replaces the memory's reminder (one per memory). 201 when created, 200 when replaced. */
    public function upsert(Request $request, Memory $memory): JsonResponse
    {
        $this->authorize('update', $memory);

        $data = $request->validate([
            'remind_at' => ['required', 'date', 'after:now'],
            'delivery' => ['sometimes', Rule::in(['notification', 'in-app'])],
            'notification_id' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $reminder = MemoryReminder::query()->where('memory_id', $memory->id)->first()
            ?? new MemoryReminder(['user_id' => $request->user()->id, 'memory_id' => $memory->id]);
        $created = ! $reminder->exists;

        $reminder->fill([
            'remind_at' => $data['remind_at'],
            'delivery' => $data['delivery'] ?? 'in-app',
            'notification_id' => $data['notification_id'] ?? null,
            'completed_at' => null, // a new time re-arms a fulfilled reminder
        ])->save();

        return (new ReminderResource($reminder))->response()->setStatusCode($created ? 201 : 200);
    }

    public function destroy(Memory $memory): JsonResponse
    {
        $this->authorize('update', $memory);
        $this->reminderOf($memory)->delete();

        return response()->json(null, 204);
    }

    public function complete(MemoryReminder $reminder): ReminderResource
    {
        $this->authorize('update', $reminder);
        $reminder->update(['completed_at' => $reminder->completed_at ?? now()]);

        return new ReminderResource($reminder);
    }

    private function reminderOf(Memory $memory): MemoryReminder
    {
        $reminder = MemoryReminder::query()->where('memory_id', $memory->id)->first();
        abort_if($reminder === null, 404);
        $this->authorize('view', $reminder);

        return $reminder;
    }
}
