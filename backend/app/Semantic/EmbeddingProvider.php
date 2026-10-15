<?php

namespace App\Semantic;

interface EmbeddingProvider
{
    /**
     * Embeds one text.
     *
     * @return list<float> exactly config('echo.semantic.dimensions') finite numbers
     *
     * @throws EmbeddingException
     */
    public function embed(string $text): array;
}
