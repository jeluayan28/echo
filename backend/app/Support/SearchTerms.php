<?php

namespace App\Support;

/**
 * Turns free text typed by a user into safe full-text search terms.
 * Only letters and digits survive (any script), so no tsquery operator (& | ! : * ( ) ' <->) or LIKE wildcard
 * can ever be injected, no matter what is typed.
 */
final class SearchTerms
{
    public const MAX_TERMS = 8;

    public const MAX_TERM_LENGTH = 40;

    /** @return list<string> lowercase, unique, at most MAX_TERMS */
    public static function parse(string $text): array
    {
        preg_match_all('/[\p{L}\p{N}]+/u', mb_strtolower($text), $matches);

        $terms = [];
        foreach ($matches[0] as $word) {
            $terms[] = mb_substr($word, 0, self::MAX_TERM_LENGTH);
        }

        return array_slice(array_values(array_unique($terms)), 0, self::MAX_TERMS);
    }

    /** "pass:* & renew:*" — every term as a prefix, all required. */
    public static function tsquery(array $terms): string
    {
        return implode(' & ', array_map(fn (string $t) => "{$t}:*", $terms));
    }
}
