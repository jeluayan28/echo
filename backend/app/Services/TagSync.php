<?php

namespace App\Services;

use App\Models\Memory;
use App\Models\Tag;

class TagSync
{
    /**
     * Makes the memory's tags exactly `$names` (normalized, deduplicated), creating tags that don't exist yet.
     * Everything is scoped to the MEMORY OWNER, and the database's composite foreign keys re-check that on the pivot.
     *
     * @param  array<int, string>  $names
     */
    public function sync(Memory $memory, array $names): void
    {
        $userId = $memory->user_id;
        $names = collect($names)->map(fn ($n) => Tag::normalize((string) $n))->filter()->unique()->values();

        if ($names->isNotEmpty()) {
            $now = now();
            Tag::query()->insertOrIgnore($names->map(fn ($name) => [
                'user_id' => $userId, 'name' => $name, 'created_at' => $now, 'updated_at' => $now,
            ])->all());
        }

        $ids = Tag::query()->where('user_id', $userId)->whereIn('name', $names)->pluck('id');
        $memory->tags()->syncWithPivotValues($ids, ['user_id' => $userId]);
    }
}
