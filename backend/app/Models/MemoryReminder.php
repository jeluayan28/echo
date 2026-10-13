<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MemoryReminder extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = ['user_id', 'memory_id', 'remind_at', 'delivery', 'notification_id', 'completed_at'];

    protected function casts(): array
    {
        return ['remind_at' => 'datetime', 'completed_at' => 'datetime'];
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
