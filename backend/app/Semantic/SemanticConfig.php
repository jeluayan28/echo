<?php

namespace App\Semantic;

/**
 * Reads config('echo.semantic') and decides whether it is a *usable and honest* setup. Fails closed: anything
 * missing or ambiguous (especially where the text is processed) means "not configured", never a guess.
 */
class SemanticConfig
{
    public const SELF_HOSTED = 'self-hosted';

    public const EXTERNAL = 'external';

    private function get(string $key, mixed $default = null): mixed
    {
        return config("echo.semantic.{$key}", $default);
    }

    public function enabled(): bool
    {
        return (bool) $this->get('enabled', false);
    }

    /** 'self-hosted', 'external' or null when the operator never declared it. */
    public function processing(): ?string
    {
        $value = $this->get('processing');

        return in_array($value, [self::SELF_HOSTED, self::EXTERNAL], true) ? $value : null;
    }

    public function providerLabel(): string
    {
        return (string) $this->get('provider_label', 'the configured embedding service');
    }

    public function baseUrl(): ?string
    {
        $url = trim((string) $this->get('base_url', ''));

        return $url === '' ? null : $url;
    }

    public function apiKey(): ?string
    {
        $key = (string) $this->get('api_key', '');

        return $key === '' ? null : $key;
    }

    public function model(): string
    {
        return trim((string) $this->get('model', ''));
    }

    public function dimensions(): int
    {
        return (int) $this->get('dimensions', 0);
    }

    public function sendDimensions(): bool
    {
        return (bool) $this->get('send_dimensions', false);
    }

    public function timeoutSeconds(): int
    {
        return max(1, (int) $this->get('timeout_seconds', 10));
    }

    public function maxChars(): int
    {
        return max(100, (int) $this->get('max_chars', 2000));
    }

    public function maxDistance(): float
    {
        return (float) $this->get('max_distance', 0.6);
    }

    public function consentVersion(): int
    {
        return (int) $this->get('consent_version', 1);
    }

    /** Why the server cannot offer semantic search, or null when the configuration is complete. */
    public function problem(): ?string
    {
        if (! $this->enabled()) {
            return 'disabled';
        }
        if ($this->processing() === null) {
            return 'processing_undeclared';
        }
        if ($this->model() === '' || $this->dimensions() < 1) {
            return 'incomplete';
        }

        $url = $this->baseUrl();
        $parts = $url ? parse_url($url) : false;
        if (! is_array($parts) || ! isset($parts['scheme'], $parts['host']) || ! in_array($parts['scheme'], ['http', 'https'], true)) {
            return 'incomplete';
        }
        // Memory text over plain http is only acceptable to an endpoint the operator runs.
        if ($parts['scheme'] === 'http' && $this->processing() === self::EXTERNAL) {
            return 'insecure_external_endpoint';
        }

        return null;
    }

    public function isConfigured(): bool
    {
        return $this->problem() === null;
    }

    /** The plain-language statement users agree to. Built from the real configuration, never hard-coded. */
    public function disclosure(): string
    {
        $what = 'To search by meaning, ECHO turns the title, text and tags of each of your memories, and each meaning-based search you run, into numbers (an "embedding"). '
            .'Audio recordings are never sent. ';

        $where = $this->processing() === self::EXTERNAL
            ? 'This text is sent to '.$this->providerLabel().', a third-party service outside ECHO’s own servers, which processes it under its own terms. '
            : 'This text is processed by '.$this->providerLabel().', which runs on infrastructure operated for ECHO, and is not sent to a third-party service. ';

        return $what.$where
            .'The resulting numbers are stored with your memories and deleted with them, or as soon as you turn this off. Normal text search keeps working either way.';
    }
}
