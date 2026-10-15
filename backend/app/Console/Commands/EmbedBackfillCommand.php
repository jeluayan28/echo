<?php

namespace App\Console\Commands;

use App\Jobs\BackfillEmbeddings;
use App\Models\User;
use App\Semantic\SemanticSearch;
use Illuminate\Console\Command;

class EmbedBackfillCommand extends Command
{
    protected $signature = 'echo:embed-backfill';

    protected $description = 'Queue embeddings for opted-in users’ memories that have no up-to-date vector (after a model change or outage)';

    public function handle(SemanticSearch $semantic): int
    {
        if (! $semantic->config()->isConfigured()) {
            $this->info('Semantic search is not configured; nothing to do.');

            return self::SUCCESS;
        }
        if (! $semantic->vectorStoreReady()) {
            $this->warn('The vector store (pgvector) is not installed; nothing to do.');

            return self::SUCCESS;
        }

        $users = 0;
        User::query()->whereNotNull('semantic_search_opt_in_at')
            ->where('semantic_search_consent_version', $semantic->config()->consentVersion())
            ->chunkById(100, function ($chunk) use (&$users) {
                foreach ($chunk as $user) {
                    BackfillEmbeddings::dispatch($user->id);
                    $users++;
                }
            });

        $this->info("Queued a backfill for {$users} user(s).");

        return self::SUCCESS;
    }
}
