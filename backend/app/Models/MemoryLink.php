<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An undirected relationship between two memories of the same user. Each pair is stored ONCE with the
 * smaller id first (the database enforces this with a CHECK + UNIQUE), so "A links B" and "B links A" are
 * the same row and a self-link cannot exist.
 */
class MemoryLink extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'from_memory_id', 'to_memory_id'];

    /** @return array{0: string, 1: string} [from, to] in storage order (byte order, same as PostgreSQL COLLATE "C"). */
    public static function canonical(string $a, string $b): array
    {
        return strcmp($a, $b) <= 0 ? [$a, $b] : [$b, $a];
    }

    public function scopeBetween(Builder $query, string $a, string $b): Builder
    {
        [$from, $to] = static::canonical($a, $b);

        return $query->where('from_memory_id', $from)->where('to_memory_id', $to);
    }

    public function scopeInvolving(Builder $query, string $memoryId): Builder
    {
        return $query->where(fn (Builder $q) => $q->where('from_memory_id', $memoryId)->orWhere('to_memory_id', $memoryId));
    }

    /** The id of the memory at the other end of this link. */
    public function otherEnd(string $memoryId): string
    {
        return $this->from_memory_id === $memoryId ? $this->to_memory_id : $this->from_memory_id;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function from(): BelongsTo
    {
        return $this->belongsTo(Memory::class, 'from_memory_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(Memory::class, 'to_memory_id');
    }
}
