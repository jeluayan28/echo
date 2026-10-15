<?php

namespace App\Semantic;

use RuntimeException;

/**
 * The embedding pipeline failed. Messages never contain memory text or provider response bodies:
 * they end up in logs.
 */
class EmbeddingException extends RuntimeException
{
    private function __construct(string $message, public readonly bool $retryable)
    {
        parent::__construct($message);
    }

    /** Timeouts, rate limits, 5xx: worth trying again later. */
    public static function transient(string $message): self
    {
        return new self($message, true);
    }

    /** Bad credentials, bad request, malformed answer: retrying will not help. */
    public static function permanent(string $message): self
    {
        return new self($message, false);
    }
}
