<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Metadata for a file stored on a filesystem disk. The bytes are never kept in the database.
 */
class Attachment extends Model
{
    use HasUlids;

    protected $fillable = ['kind', 'disk', 'path', 'mime_type', 'size_bytes', 'duration_ms'];

    public function memory(): BelongsTo
    {
        return $this->belongsTo(Memory::class);
    }
}
