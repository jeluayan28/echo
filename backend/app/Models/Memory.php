<?php

namespace App\Models;

use App\Enums\MemoryType;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Memory extends Model
{
    use HasUlids, SoftDeletes;

    protected $fillable = [
        'type', 'title', 'body', 'source_url', 'collection_id', 'favorite', 'pinned',
    ];

    protected function casts(): array
    {
        return [
            'type' => MemoryType::class,
            'favorite' => 'boolean',
            'pinned' => 'boolean',
            'last_opened_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class);
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class);
    }

    public function attachment(): HasOne
    {
        return $this->hasOne(Attachment::class);
    }
}
