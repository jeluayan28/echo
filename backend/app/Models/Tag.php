<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Tag extends Model
{
    use HasFactory;

    protected $fillable = ['name'];

    /** Tags are stored lowercase, trimmed, without a leading "#", with single spaces. */
    public static function normalize(string $name): string
    {
        $name = ltrim(trim($name), '#');

        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $name)));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function memories(): BelongsToMany
    {
        return $this->belongsToMany(Memory::class)->withPivot('user_id');
    }
}
