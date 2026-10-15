<?php

namespace Tests\Support;

use App\Semantic\EmbeddingException;
use App\Semantic\EmbeddingProvider;

/**
 * A deterministic stand-in for an embedding model: words belong to a few "concepts", and a text's vector is the
 * normalised count of the concepts it mentions. Texts about the same concept are close, different concepts are
 * orthogonal (cosine distance 1), a text that mixes two concepts sits between them.
 *
 * This tests the PIPELINE and the ranking / scoping SQL. It says nothing about how good a real model is.
 */
class FakeEmbeddingProvider implements EmbeddingProvider
{
    public const CONCEPTS = [
        0 => ['passport', 'visa', 'travel', 'flight', 'trip', 'airport', 'abroad'],
        1 => ['dentist', 'doctor', 'health', 'checkup', 'appointment', 'clinic'],
        2 => ['sourdough', 'bread', 'recipe', 'baking', 'flour', 'oven'],
    ];

    /** Texts received, in order. */
    public array $calls = [];

    /** Set to make every call fail: 'transient' or 'permanent'. */
    public ?string $failWith = null;

    public function __construct(private readonly int $dimensions) {}

    public function embed(string $text): array
    {
        $this->calls[] = $text;

        if ($this->failWith === 'transient') {
            throw EmbeddingException::transient('fake outage');
        }
        if ($this->failWith === 'permanent') {
            throw EmbeddingException::permanent('fake rejection');
        }

        $vector = array_fill(0, $this->dimensions, 0.0);
        $words = preg_split('/[^a-z]+/', strtolower($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $hits = 0;
        foreach ($words as $word) {
            foreach (self::CONCEPTS as $index => $vocabulary) {
                if (in_array($word, $vocabulary, true)) {
                    $vector[$index] += 1.0;
                    $hits++;
                }
            }
        }
        if ($hits === 0) {
            $vector[$this->dimensions - 1] = 1.0; // "something else" is its own direction
        }

        $norm = sqrt(array_sum(array_map(fn ($v) => $v * $v, $vector)));

        return array_map(fn ($v) => $v / $norm, $vector);
    }
}
