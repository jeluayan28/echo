<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * Metadata for a file stored on a filesystem disk. The bytes are never kept in the database.
 * `memory_id` is null for an upload that has not been attached to a memory yet.
 */
class Attachment extends Model
{
    use HasFactory, HasUlids;

    protected $fillable = ['user_id', 'memory_id', 'kind', 'disk', 'path', 'mime_type', 'size_bytes', 'duration_ms'];

    /** Storage internals are never exposed to clients. */
    protected $hidden = ['disk', 'path'];

    protected function casts(): array
    {
        return ['size_bytes' => 'integer', 'duration_ms' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function memory(): BelongsTo
    {
        return $this->belongsTo(Memory::class);
    }

    /** Removes the stored file (not the row). Safe to call when the file is already gone. */
    public function deleteStoredFile(): void
    {
        Storage::disk($this->disk)->delete($this->path);
    }
}
