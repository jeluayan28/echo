<?php

namespace App\Semantic;

use App\Jobs\EmbedMemory;
use App\Models\Memory;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Everything about semantic search that is not HTTP: is it really available, may we index this user, where the
 * vectors live. The rule that matters: `available` is true ONLY when the whole pipeline works end to end —
 * configured, vector store present, and the embedding endpoint answering a real request — never merely "enabled".
 */
class SemanticSearch
{
    private const HEALTH_KEY = 'echo:semantic:provider-health';

    private ?bool $storeReady = null;

    public function __construct(
        private readonly SemanticConfig $config,
        private readonly EmbeddingProvider $provider,
    ) {}

    public function config(): SemanticConfig
    {
        return $this->config;
    }

    // ── availability ──────────────────────────────────────────────────────────

    /** pgvector installed and the table migrated. (The migration skips itself when the extension is missing.) */
    public function vectorStoreReady(): bool
    {
        return $this->storeReady ??= DB::getDriverName() === 'pgsql' && Schema::hasTable('memory_embeddings');
    }

    /**
     * A tiny fixed request that carries no user data. Trusted for a few minutes (a failure for a shorter time),
     * and refreshed for free by every real embedding that succeeds or fails.
     */
    public function providerHealthy(): bool
    {
        $cached = Cache::get(self::HEALTH_KEY);
        if ($cached !== null) {
            return $cached === 'ok';
        }

        try {
            $this->provider->embed('health check');
            $this->recordHealth(true);

            return true;
        } catch (EmbeddingException) {
            $this->recordHealth(false);

            return false;
        }
    }

    public function recordHealth(bool $ok): void
    {
        Cache::put(
            self::HEALTH_KEY,
            $ok ? 'ok' : 'failing',
            (int) config($ok ? 'echo.semantic.health_ttl_seconds' : 'echo.semantic.health_fail_ttl_seconds', 60),
        );
    }

    /**
     * The honest state for one user.
     *
     * state: unavailable | off | indexing | ready
     * reason (only when unavailable): not_configured | no_vector_store | provider_down
     *
     * @return array<string, mixed>
     */
    public function status(User $user): array
    {
        $base = [
            'available' => false,
            'enabled' => $this->optedIn($user),
            'state' => 'unavailable',
            'reason' => null,
            'processing' => $this->config->processing(),
            'provider' => $this->config->providerLabel(),
            'disclosure' => $this->config->disclosure(),
            'consent_version' => $this->config->consentVersion(),
            'indexed' => 0,
            'total' => 0,
        ];

        if (! $this->config->isConfigured()) {
            return ['reason' => 'not_configured', 'processing' => null, 'provider' => null, 'disclosure' => null] + $base;
        }
        if (! $this->vectorStoreReady()) {
            return ['reason' => 'no_vector_store'] + $base;
        }
        if (! $this->providerHealthy()) {
            return ['reason' => 'provider_down'] + $base;
        }

        $base['available'] = true;
        $base['reason'] = null;

        if (! $base['enabled']) {
            return ['state' => 'off'] + $base;
        }

        $total = $user->memories()->count();
        $indexed = $this->indexedQuery($user->id)->count();

        return ['state' => $indexed >= $total ? 'ready' : 'indexing', 'indexed' => min($indexed, $total), 'total' => $total] + $base;
    }

    // ── consent ───────────────────────────────────────────────────────────────

    public function optedIn(User $user): bool
    {
        return $user->semantic_search_opt_in_at !== null
            && (int) $user->semantic_search_consent_version === $this->config->consentVersion();
    }

    /** Should writes of this user's memories be indexed? Cheap exit when the server feature is off. */
    public function shouldIndex(int $userId): bool
    {
        if (! $this->config->isConfigured() || ! $this->vectorStoreReady()) {
            return false;
        }
        $user = User::query()->find($userId, ['id', 'semantic_search_opt_in_at', 'semantic_search_consent_version']);

        return $user !== null && $this->optedIn($user);
    }

    public function optIn(User $user): void
    {
        $user->forceFill([
            'semantic_search_opt_in_at' => now(),
            'semantic_search_consent_version' => $this->config->consentVersion(),
        ])->save();
    }

    /** Turning it off removes the vectors: nothing derived from the user's text is kept. */
    public function optOut(User $user): void
    {
        $user->forceFill(['semantic_search_opt_in_at' => null, 'semantic_search_consent_version' => null])->save();
        $this->forgetAllFor($user->id);
    }

    // ── storage ───────────────────────────────────────────────────────────────

    /** @param  list<float>  $vector */
    public function store(Memory $memory, string $model, string $hash, array $vector): void
    {
        DB::statement(
            'INSERT INTO memory_embeddings (memory_id, user_id, model, content_hash, embedding, embedded_at)
             VALUES (?, ?, ?, ?, ?::vector, now())
             ON CONFLICT (memory_id) DO UPDATE SET
                user_id = EXCLUDED.user_id, model = EXCLUDED.model, content_hash = EXCLUDED.content_hash,
                embedding = EXCLUDED.embedding, embedded_at = EXCLUDED.embedded_at',
            [$memory->id, $memory->user_id, $model, $hash, self::literal($vector)],
        );
    }

    /** Removes a memory's vector. Always scoped to its owner: a stray id can never delete someone else's. */
    public function forget(string $memoryId, int $userId): void
    {
        if ($this->vectorStoreReady()) {
            DB::table('memory_embeddings')->where('memory_id', $memoryId)->where('user_id', $userId)->delete();
        }
    }

    /**
     * Queues the embedding of one memory. Never throws: a queue or provider problem must not break saving a
     * memory (with a synchronous queue the job runs inline and its failure would otherwise reach the request).
     */
    public function queueEmbedding(string $memoryId, int $userId): void
    {
        // After the surrounding transaction commits, so the job sees the finished memory and its tags. The try/catch
        // lives INSIDE the callback: that is where a synchronous queue would run (and fail) the job.
        DB::afterCommit(function () use ($memoryId, $userId) {
            try {
                EmbedMemory::dispatch($memoryId, $userId);
            } catch (Throwable $e) {
                Log::warning('Could not queue a memory embedding', ['memory_id' => $memoryId, 'error' => $e::class]);
            }
        });
    }

    public function forgetAllFor(int $userId): void
    {
        if ($this->vectorStoreReady()) {
            DB::table('memory_embeddings')->where('user_id', $userId)->delete();
        }
    }

    /** Fingerprint stored for a memory, or null if it has no vector. */
    public function fingerprint(string $memoryId): ?object
    {
        return DB::table('memory_embeddings')->where('memory_id', $memoryId)->first(['model', 'content_hash']);
    }

    /** This user's vectors that belong to a live memory and were made by the CURRENT model. */
    private function indexedQuery(int $userId): \Illuminate\Database\Query\Builder
    {
        return DB::table('memory_embeddings as e')
            ->join('memories as m', 'm.id', '=', 'e.memory_id')
            ->where('e.user_id', $userId)
            ->where('m.user_id', $userId)
            ->whereNull('m.deleted_at')
            ->where('e.model', $this->config->model());
    }

    // ── search ────────────────────────────────────────────────────────────────

    /** @return list<float> @throws EmbeddingException */
    public function embedQuery(string $query): array
    {
        $text = MemoryText::clean($query, min(500, $this->config->maxChars()));
        if ($text === '') {
            throw EmbeddingException::permanent('The search query is empty.');
        }

        try {
            $vector = $this->provider->embed($text);
        } catch (EmbeddingException $e) {
            $this->recordHealth(false);
            throw $e;
        }
        $this->recordHealth(true);

        return $vector;
    }

    /**
     * Restricts a memory query to the caller's semantically similar memories, nearest first. The join is
     * tenant-scoped a second time (e.user_id) and uses an exact scan inside one user's rows: approximate
     * indexes can silently under-return when many tenants share a table, and one person's memories are small.
     *
     * @param  Builder<Memory>  $query
     * @param  list<float>  $vector
     * @return Builder<Memory>
     */
    public function nearest(Builder $query, int $userId, array $vector): Builder
    {
        $literal = self::literal($vector);

        return $query
            ->join('memory_embeddings as e', function ($join) use ($userId) {
                $join->on('e.memory_id', '=', 'memories.id')
                    ->where('e.user_id', '=', $userId)
                    ->where('e.model', '=', $this->config->model());
            })
            ->whereRaw('(e.embedding <=> ?::vector) < ?', [$literal, $this->config->maxDistance()])
            ->selectRaw('(e.embedding <=> ?::vector) as distance', [$literal])
            ->orderBy('distance')
            ->orderBy('memories.id');
    }

    /** @param  list<float>  $vector */
    public static function literal(array $vector): string
    {
        return '['.implode(',', array_map(fn (float $v) => rtrim(rtrim(sprintf('%.9F', $v), '0'), '.') ?: '0', $vector)).']';
    }
}
