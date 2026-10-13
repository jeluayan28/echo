<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationPreference extends Model
{
    protected $fillable = ['user_id', 'reminders_enabled', 'timezone', 'quiet_hours_start', 'quiet_hours_end'];

    protected function casts(): array
    {
        return ['reminders_enabled' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
