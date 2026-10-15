<?php

namespace App\Semantic;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/** Talks to any OpenAI-compatible `POST {base_url}/embeddings` endpoint (OpenAI, Ollama, TEI, vLLM, ...). */
class HttpEmbeddingProvider implements EmbeddingProvider
{
    public function __construct(private readonly SemanticConfig $config) {}

    public function embed(string $text): array
    {
        if (! $this->config->isConfigured()) {
            throw EmbeddingException::permanent('Semantic search is not configured.');
        }

        $payload = ['model' => $this->config->model(), 'input' => $text];
        if ($this->config->sendDimensions()) {
            $payload['dimensions'] = $this->config->dimensions();
        }

        try {
            $request = Http::baseUrl(rtrim((string) $this->config->baseUrl(), '/'))
                ->acceptJson()
                ->asJson()
                ->timeout($this->config->timeoutSeconds())
                ->connectTimeout(min(3, $this->config->timeoutSeconds()))
                // A redirect could send memory text to a host the operator never configured.
                ->withOptions(['allow_redirects' => false]);

            if ($key = $this->config->apiKey()) {
                $request = $request->withToken($key);
            }

            $response = $request->post('/embeddings', $payload);
        } catch (ConnectionException) {
            throw EmbeddingException::transient('The embedding service could not be reached.');
        }

        $status = $response->status();
        if ($status === 429 || $status >= 500) {
            throw EmbeddingException::transient("The embedding service answered HTTP {$status}.");
        }
        if ($status >= 300) {
            throw EmbeddingException::permanent("The embedding service answered HTTP {$status}.");
        }

        return $this->validated($response->json('data.0.embedding'));
    }

    /** @return list<float> */
    private function validated(mixed $vector): array
    {
        $expected = $this->config->dimensions();

        if (! is_array($vector) || ! array_is_list($vector) || count($vector) !== $expected) {
            throw EmbeddingException::permanent("The embedding service did not return {$expected} numbers.");
        }

        $clean = [];
        foreach ($vector as $value) {
            if ((! is_int($value) && ! is_float($value)) || ! is_finite((float) $value)) {
                throw EmbeddingException::permanent('The embedding service returned a non-numeric value.');
            }
            $clean[] = (float) $value;
        }

        return $clean;
    }
}
