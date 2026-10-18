<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RediscoveryState extends Model
{
    protected $fillable = ['user_id', 'memory_id', 'dismissed_at', 'snoozed_until'];

    protected function casts(): array
    {
        return ['dismissed_at' => 'datetime', 'snoozed_until' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function memory(): BelongsTo
    {
        return $this->belongsTo(Memory::class);
    }
}
