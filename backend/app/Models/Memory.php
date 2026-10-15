<?php

namespace App\Models;

use App\Enums\MemoryType;
use App\Semantic\SemanticSearch;
use App\Support\SearchTerms;
use Database\Factories\MemoryFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Memory extends Model
{
    /** @use HasFactory<MemoryFactory> */
    use HasFactory, HasUlids, SoftDeletes;

    protected $fillable = [
        'type', 'title', 'body', 'source_url', 'collection_id', 'favorite', 'pinned',
    ];

    /** The generated full-text column is never sent to clients. */
    protected $hidden = ['search_vector'];

    protected function casts(): array
    {
        return [
            'type' => MemoryType::class,
            'favorite' => 'boolean',
            'pinned' => 'boolean',
            'last_opened_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Optional semantic search: keep the vector in step with the memory (see App\Semantic). The server-level
        // switch is checked first, so a deployment without the feature pays nothing, not even a query.
        static::saved(function (Memory $memory) {
            if (! config('echo.semantic.enabled')) {
                return;
            }
            // Pinning, starring and opening change nothing a vector is made from.
            $changed = array_keys($memory->getChanges());
            if ($changed !== [] && array_diff($changed, ['favorite', 'pinned', 'last_opened_at', 'updated_at']) === []) {
                return;
            }
            if (app(SemanticSearch::class)->shouldIndex($memory->user_id)) {
                app(SemanticSearch::class)->queueEmbedding($memory->id, $memory->user_id);
            }
        });
        static::deleted(function (Memory $memory) { // soft or hard: trashed memories must not be searchable
            if (config('echo.semantic.enabled')) {
                app(SemanticSearch::class)->forget($memory->id, $memory->user_id);
            }
        });
        static::restored(function (Memory $memory) {
            if (config('echo.semantic.enabled') && app(SemanticSearch::class)->shouldIndex($memory->user_id)) {
                app(SemanticSearch::class)->queueEmbedding($memory->id, $memory->user_id);
            }
        });

        // A permanent delete must also remove the stored file: the database cascade only removes the row.
        static::forceDeleting(function (Memory $memory) {
            Attachment::query()->where('memory_id', $memory->id)->get()->each->deleteStoredFile();
        });
    }

    /** Columns for list views: everything EXCEPT the full body and the search vector (see scopeSummary). */
    public const SUMMARY_COLUMNS = [
        'memories.id', 'memories.user_id', 'memories.collection_id', 'memories.type', 'memories.title',
        'memories.source_url', 'memories.favorite', 'memories.pinned', 'memories.last_opened_at',
        'memories.created_at', 'memories.updated_at', 'memories.deleted_at',
    ];

    /**
     * Lean list representation: a 200-character `excerpt` instead of the body, the number of live links, and the
     * relations the resource needs eager-loaded (so listing N memories costs a constant number of queries).
     */
    public function scopeSummary(Builder $query): Builder
    {
        return $query
            ->select(self::SUMMARY_COLUMNS)
            ->selectRaw('left(memories.body, 200) as excerpt')
            // Links to trashed memories don't count: they are not visible until the memory is restored.
            ->selectRaw('(select count(*) from memory_links l
                join memories o on o.id = (case when l.from_memory_id = memories.id then l.to_memory_id else l.from_memory_id end)
                    and o.deleted_at is null
                where l.from_memory_id = memories.id or l.to_memory_id = memories.id) as link_count')
            ->with(['tags:id,name', 'attachment']);
    }

    /** @param array{type?: string, collection_id?: string, tag?: string, favorite?: bool, pinned?: bool} $filters */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['type'] ?? null, fn (Builder $q, $type) => $q->where('memories.type', $type))
            ->when($filters['collection_id'] ?? null, fn (Builder $q, $id) => $id === 'none'
                ? $q->whereNull('memories.collection_id')
                : $q->where('memories.collection_id', $id))
            ->when($filters['tag'] ?? null, fn (Builder $q, $tag) => $q->whereHas('tags', fn (Builder $t) => $t->where('tags.name', Tag::normalize($tag))))
            ->when(array_key_exists('favorite', $filters) && $filters['favorite'] !== null, fn (Builder $q) => $q->where('memories.favorite', (bool) $filters['favorite']))
            ->when(array_key_exists('pinned', $filters) && $filters['pinned'] !== null, fn (Builder $q) => $q->where('memories.pinned', (bool) $filters['pinned']));
    }

    /**
     * PostgreSQL full-text search over title + content (GIN-indexed generated column) and tags.
     * Every term must match somewhere (AND); the last word of the query is matched as a PREFIX, so
     * search-as-you-type works. Results are ranked: title hits outrank content hits (weights A/B).
     * Terms are reduced to letters/digits before they reach SQL and always bound as parameters.
     */
    public function scopeSearch(Builder $query, string $text, int $userId): Builder
    {
        $terms = SearchTerms::parse($text);
        if ($terms === []) {
            return $query->whereRaw('false');
        }

        foreach ($terms as $term) {
            $query->where(function (Builder $w) use ($term, $userId) {
                $w->whereRaw("memories.search_vector @@ to_tsquery('simple', ?)", ["{$term}:*"])
                    ->orWhereExists(fn ($e) => $e->selectRaw('1')
                        ->from('memory_tag as mt')
                        ->join('tags as tg', 'tg.id', '=', 'mt.tag_id')
                        ->whereColumn('mt.memory_id', 'memories.id')
                        ->where('tg.user_id', $userId)
                        ->where('tg.name', 'like', "{$term}%"));
            });
        }

        return $query
            ->selectRaw("ts_rank_cd(memories.search_vector, to_tsquery('simple', ?), 32) as rank", [SearchTerms::tsquery($terms)])
            ->orderByDesc('rank')
            ->orderByDesc('memories.updated_at');
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
        return $this->belongsToMany(Tag::class)->withPivot('user_id');
    }

    public function attachment(): HasOne
    {
        return $this->hasOne(Attachment::class);
    }

    public function reminder(): HasOne
    {
        return $this->hasOne(MemoryReminder::class);
    }
}
