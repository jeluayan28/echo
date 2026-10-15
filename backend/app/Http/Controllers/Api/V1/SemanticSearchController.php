<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\BackfillEmbeddings;
use App\Semantic\SemanticSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The user's semantic-search switch. Opting in sends the text of their memories to the embedding service, so it
 * needs explicit consent to the CURRENT disclosure, and it is refused outright while the pipeline is not working
 * end to end: the app must never offer something that would silently do nothing.
 */
class SemanticSearchController extends Controller
{
    public function __construct(private readonly SemanticSearch $semantic) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->semantic->status($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'acknowledged' => ['sometimes', 'boolean'],
            'consent_version' => ['sometimes', 'integer'],
        ]);
        $user = $request->user();

        if (! $data['enabled']) {
            $this->semantic->optOut($user);

            return response()->json(['data' => $this->semantic->status($user->refresh())]);
        }

        if (! ($data['acknowledged'] ?? false) || ($data['consent_version'] ?? null) !== $this->semantic->config()->consentVersion()) {
            return response()->json([
                'message' => 'Please read and accept how your memories are processed before turning this on.',
                'errors' => ['acknowledged' => ['You need to accept the current explanation first.']],
            ], 422);
        }

        $status = $this->semantic->status($user);
        if (! $status['available']) {
            return response()->json([
                'message' => 'Semantic search isn’t available right now.',
                'reason' => $status['reason'],
            ], 409);
        }

        $this->semantic->optIn($user);
        BackfillEmbeddings::dispatch($user->id);

        return response()->json(['data' => $this->semantic->status($user->refresh())]);
    }
}
