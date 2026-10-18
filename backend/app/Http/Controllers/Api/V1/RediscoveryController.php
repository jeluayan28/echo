<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Memory;
use App\Models\RediscoveryState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The caller's snooze / dismiss choices for Rediscovery suggestions. */
class RediscoveryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = RediscoveryState::query()
            ->where('user_id', $request->user()->id)
            ->whereHas('memory') // not for memories in the trash
            ->get(['memory_id', 'dismissed_at', 'snoozed_until']);

        return response()->json(['data' => $rows->map(fn ($r) => $this->present($r))->values()]);
    }

    /** Merges the given fields into the memory's state; a key sent as null clears it. */
    public function upsert(Request $request, Memory $memory): JsonResponse
    {
        $this->authorize('update', $memory);

        $data = $request->validate([
            'dismissed_at' => ['sometimes', 'nullable', 'date'],
            'snoozed_until' => ['sometimes', 'nullable', 'date'],
        ]);

        $state = RediscoveryState::query()->firstOrNew(['memory_id' => $memory->id]);
        $state->user_id = $request->user()->id;
        $state->fill($data)->save();

        return response()->json(['data' => $this->present($state)]);
    }

    private function present(RediscoveryState $s): array
    {
        return [
            'memory_id' => $s->memory_id,
            'dismissed_at' => $s->dismissed_at?->toIso8601String(),
            'snoozed_until' => $s->snoozed_until?->toIso8601String(),
        ];
    }
}
