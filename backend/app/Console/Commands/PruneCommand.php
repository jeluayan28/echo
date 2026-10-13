<?php

namespace App\Console\Commands;

use App\Models\Attachment;
use App\Models\Memory;
use Illuminate\Console\Command;

class PruneCommand extends Command
{
    protected $signature = 'echo:prune {--dry-run : Only report what would be removed}';

    protected $description = 'Remove uploads never attached to a memory, and memories that have been in the trash too long (with their files)';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $orphans = 0;
        $purged = 0;

        // 1. Uploads that were never claimed by a memory (e.g. the app crashed between upload and save).
        $cutoff = now()->subHours((int) config('echo.attachments.orphan_ttl_hours'));
        Attachment::query()->whereNull('memory_id')->where('created_at', '<', $cutoff)
            ->chunkById(100, function ($attachments) use ($dry, &$orphans) {
                foreach ($attachments as $attachment) {
                    $orphans++;
                    if (! $dry) {
                        $attachment->deleteStoredFile();
                        $attachment->delete();
                    }
                }
            });

        // 2. Memories whose "Undo" window is long gone. forceDelete() also removes the stored file.
        $trashCutoff = now()->subDays((int) config('echo.trash_retention_days'));
        Memory::onlyTrashed()->where('deleted_at', '<', $trashCutoff)
            ->chunkById(100, function ($memories) use ($dry, &$purged) {
                foreach ($memories as $memory) {
                    $purged++;
                    if (! $dry) {
                        $memory->forceDelete();
                    }
                }
            });

        $this->info(($dry ? '[dry run] ' : '')."Orphaned uploads: {$orphans}. Trashed memories purged: {$purged}.");

        return self::SUCCESS;
    }
}
