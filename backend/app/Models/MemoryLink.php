<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MemoryLink extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'from_memory_id', 'to_memory_id'];

    public function from(): BelongsTo
    {
        return $this->belongsTo(Memory::class, 'from_memory_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(Memory::class, 'to_memory_id');
    }
}
