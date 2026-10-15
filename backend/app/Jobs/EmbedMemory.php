<?php

namespace App\Jobs;

use App\Models\Memory;
use App\Semantic\EmbeddingException;
use App\Semantic\EmbeddingProvider;
use App\Semantic\MemoryText;
use App\Semantic\SemanticSearch;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\RateLimited;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Computes (or refreshes) one memory's embedding, off the request path. It re-checks everything when it RUNS,
 * not when it was queued: the user may have opted out, the memory may have been deleted or edited since.
 */
class EmbedMemory implements ShouldBeUniqueUntilProcessing, ShouldQueue
{
    use Dispatchable, Queueable, SerializesModels;

    public int $tries = 4;

    public function __construct(public readonly string $memoryId, public readonly int $userId) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [30, 120, 600];
    }

    public function uniqueId(): string
    {
        return $this->memoryId;
    }

    /** @return list<object> */
    public function middleware(): array
    {
        return [(new RateLimited('embeddings'))->releaseAfter(30)];
    }

    public function handle(SemanticSearch $semantic, EmbeddingProvider $provider): void
    {
        if (! $semantic->shouldIndex($this->userId)) {
            return;
        }

        $memory = Memory::query()->with('tags:id,name')->where('user_id', $this->userId)->find($this->memoryId);
        if ($memory === null) { // deleted or in the trash: nothing should be searchable
            $semantic->forget($this->memoryId, $this->userId);

            return;
        }

        $config = $semantic->config();
        $text = MemoryText::for($memory, $config->maxChars());
        if ($text === '') {
            $semantic->forget($memory->id, $this->userId);

            return;
        }

        $hash = MemoryText::hash($config->model(), $text);
        $current = $semantic->fingerprint($memory->id);
        if ($current && $current->content_hash === $hash && $current->model === $config->model()) {
            return; // nothing changed since the last embedding
        }

        try {
            $vector = $provider->embed($text);
        } catch (EmbeddingException $e) {
            $semantic->recordHealth(false);
            if ($e->retryable) {
                throw $e; // the queue retries with backoff
            }
            $this->fail($e);

            return;
        }
        $semantic->recordHealth(true);

        // The call took a while: honour an opt-out that happened meanwhile instead of storing a vector.
        if (! $semantic->shouldIndex($this->userId)) {
            return;
        }

        $semantic->store($memory, $config->model(), $hash, $vector);
    }

    public function failed(Throwable $e): void
    {
        // Ids and the error class only: never the memory text, never a provider response body.
        Log::warning('Memory embedding failed', ['memory_id' => $this->memoryId, 'error' => $e::class, 'message' => $e->getMessage()]);
    }
}
