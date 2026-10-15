<?php

namespace App\Jobs;

use App\Models\Memory;
use App\Semantic\SemanticSearch;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/** Queues an EmbedMemory for every live memory of one user that has no up-to-date vector (opt-in, model change). */
class BackfillEmbeddings implements ShouldQueue
{
    use Dispatchable, Queueable;

    public function __construct(public readonly int $userId) {}

    public function handle(SemanticSearch $semantic): void
    {
        if (! $semantic->shouldIndex($this->userId)) {
            return;
        }

        $model = $semantic->config()->model();

        Memory::query()
            ->where('user_id', $this->userId)
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('memory_embeddings as e')
                ->whereColumn('e.memory_id', 'memories.id')->where('e.model', $model))
            ->chunkById(200, function ($memories) {
                foreach ($memories as $memory) {
                    EmbedMemory::dispatch($memory->id, $memory->user_id);
                }
            }, 'memories.id', 'id');
    }
}
