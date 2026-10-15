<?php

namespace App\Semantic;

use App\Models\Memory;

/** What gets embedded for a memory, and the fingerprint used to skip work when nothing changed. */
final class MemoryText
{
    public static function for(Memory $memory, int $maxChars): string
    {
        $parts = [(string) $memory->title, (string) ($memory->body ?? '')];

        // Tags are part of how a memory is found. Only loaded relations are used: no hidden queries.
        if ($memory->relationLoaded('tags') && $memory->tags->isNotEmpty()) {
            $parts[] = 'Tags: '.$memory->tags->pluck('name')->implode(', ');
        }

        return self::clean(implode("\n", $parts), $maxChars);
    }

    public static function clean(string $text, int $maxChars): string
    {
        // Control characters out, runs of whitespace collapsed, cut on a character boundary.
        $text = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', ' ', $text);
        $text = trim((string) preg_replace('/[ \t]+/u', ' ', preg_replace('/\n{3,}/u', "\n\n", $text) ?? ''));

        return mb_substr($text, 0, $maxChars);
    }

    public static function hash(string $model, string $text): string
    {
        return hash('sha256', $model."\0".$text);
    }
}
