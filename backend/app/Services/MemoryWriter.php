<?php

namespace App\Services;

use App\Models\Attachment;
use App\Models\Memory;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Creates and updates memories together with their tags and attachment, atomically. */
class MemoryWriter
{
    private const FIELDS = ['type', 'title', 'body', 'source_url', 'collection_id', 'favorite', 'pinned'];

    public function __construct(private readonly TagSync $tags) {}

    public function create(User $user, array $data): Memory
    {
        return DB::transaction(function () use ($user, $data) {
            $memory = $user->memories()->make(Arr::only($data, self::FIELDS));
            $memory->last_opened_at = now(); // a memory you just wrote counts as "opened"
            $memory->save();

            $this->tags->sync($memory, $data['tags'] ?? []);

            if (! empty($data['attachment_id'])) {
                $this->claim($user->id, $memory, $data['attachment_id']);
            }

            return $memory;
        });
    }

    public function update(Memory $memory, array $data): Memory
    {
        $replaced = null;

        DB::transaction(function () use ($memory, $data, &$replaced) {
            $memory->fill(Arr::only($data, array_diff(self::FIELDS, ['type']))); // the type is fixed once created
            $memory->save();

            if (array_key_exists('tags', $data)) {
                $this->tags->sync($memory, $data['tags'] ?? []);
            }

            if (! empty($data['attachment_id'])) {
                $current = Attachment::query()->where('memory_id', $memory->id)->first();
                if ($current?->id !== $data['attachment_id']) {
                    $current?->delete(); // frees the one-attachment-per-memory slot; the FILE is removed after commit
                    $this->claim($memory->user_id, $memory, $data['attachment_id']);
                    $replaced = $current;
                }
            }
        });

        // Only once the new recording is safely attached do we delete the old file.
        $replaced?->deleteStoredFile();

        return $memory;
    }

    /**
     * Attaches an already-uploaded, still-unclaimed file of THIS user. The conditional UPDATE is atomic: two
     * requests racing for the same upload cannot both win.
     */
    private function claim(int $userId, Memory $memory, string $attachmentId): void
    {
        $claimed = Attachment::query()
            ->whereKey($attachmentId)
            ->where('user_id', $userId)
            ->whereNull('memory_id')
            ->update(['memory_id' => $memory->id]);

        if ($claimed !== 1) {
            throw ValidationException::withMessages(['attachment_id' => 'This upload is not available.']);
        }
    }
}
