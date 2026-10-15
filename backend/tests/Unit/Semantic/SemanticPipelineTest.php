<?php

namespace Tests\Unit\Semantic;

use App\Models\Memory;
use App\Semantic\EmbeddingException;
use App\Semantic\EmbeddingProvider;
use App\Semantic\HttpEmbeddingProvider;
use App\Semantic\MemoryText;
use App\Semantic\SemanticConfig;
use App\Semantic\SemanticSearch;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeEmbeddingProvider;
use Tests\TestCase;

/**
 * Everything about semantic search that needs no database: configuration honesty, the HTTP client's handling of
 * a misbehaving embedding service, text preparation, and the health logic behind "available".
 */
class SemanticPipelineTest extends TestCase
{
    private function configure(array $overrides = []): void
    {
        config(['echo.semantic' => array_merge([
            'enabled' => true,
            'processing' => 'self-hosted',
            'provider_label' => 'a test server',
            'base_url' => 'http://embeddings.test/v1',
            'api_key' => null,
            'model' => 'test-model',
            'dimensions' => 4,
            'send_dimensions' => false,
            'timeout_seconds' => 5,
            'max_chars' => 2000,
            'max_distance' => 0.6,
            'health_ttl_seconds' => 300,
            'health_fail_ttl_seconds' => 60,
            'consent_version' => 1,
        ], $overrides)]);
        app()->forgetInstance(SemanticConfig::class);
    }

    // ── configuration honesty ────────────────────────────────────────────────

    public static function brokenConfigs(): array
    {
        return [
            'switched off' => [['enabled' => false], 'disabled'],
            'nobody said where text is processed' => [['processing' => null], 'processing_undeclared'],
            'a made-up processing value' => [['processing' => 'cloud-ish'], 'processing_undeclared'],
            'no model' => [['model' => ''], 'incomplete'],
            'no dimensions' => [['dimensions' => 0], 'incomplete'],
            'no endpoint' => [['base_url' => null], 'incomplete'],
            'endpoint is not a url' => [['base_url' => 'not a url'], 'incomplete'],
            'external over plain http' => [['processing' => 'external', 'base_url' => 'http://api.example.com/v1'], 'insecure_external_endpoint'],
        ];
    }

    #[DataProvider('brokenConfigs')]
    public function test_an_incomplete_or_unsafe_setup_is_never_considered_configured(array $override, string $problem): void
    {
        $this->configure($override);

        $config = app(SemanticConfig::class);
        $this->assertFalse($config->isConfigured());
        $this->assertSame($problem, $config->problem());
    }

    public function test_a_complete_setup_is_configured_for_both_processing_modes(): void
    {
        $this->configure();
        $this->assertTrue(app(SemanticConfig::class)->isConfigured());

        $this->configure(['processing' => 'external', 'base_url' => 'https://api.example.com/v1']);
        $this->assertTrue(app(SemanticConfig::class)->isConfigured());
    }

    public function test_the_disclosure_tells_the_truth_about_where_text_goes(): void
    {
        $this->configure(['processing' => 'external', 'base_url' => 'https://api.example.com/v1', 'provider_label' => 'Acme Embeddings']);
        $external = app(SemanticConfig::class)->disclosure();
        $this->assertStringContainsString('Acme Embeddings', $external);
        $this->assertStringContainsString('third-party', $external);
        $this->assertStringContainsString('Audio recordings are never sent', $external);

        $this->configure(['processing' => 'self-hosted', 'provider_label' => 'our own server']);
        $own = app(SemanticConfig::class)->disclosure();
        $this->assertStringContainsString('our own server', $own);
        $this->assertStringContainsString('not sent to a third-party', $own);
        $this->assertStringNotContainsString('third-party service outside', $own);
    }

    // ── the HTTP client ──────────────────────────────────────────────────────

    public function test_it_returns_the_vector_and_sends_only_what_it_should(): void
    {
        $this->configure(['api_key' => 'secret-key']);
        Http::fake(['embeddings.test/*' => Http::response(['data' => [['embedding' => [0.1, 0.2, 0.3, 0.4]]]])]);

        $vector = app(HttpEmbeddingProvider::class)->embed('hello');

        $this->assertSame([0.1, 0.2, 0.3, 0.4], $vector);
        Http::assertSent(function (Request $request) {
            return $request->url() === 'http://embeddings.test/v1/embeddings'
                && $request->hasHeader('Authorization', 'Bearer secret-key')
                && $request->data() === ['model' => 'test-model', 'input' => 'hello'];
        });
    }

    public function test_it_asks_for_a_size_only_when_configured_to(): void
    {
        $this->configure(['send_dimensions' => true]);
        Http::fake(['*' => Http::response(['data' => [['embedding' => [1, 0, 0, 0]]]])]);

        app(HttpEmbeddingProvider::class)->embed('hello');

        Http::assertSent(fn (Request $r) => ($r->data()['dimensions'] ?? null) === 4);
    }

    public function test_it_does_not_call_out_when_the_setup_is_not_configured(): void
    {
        $this->configure(['processing' => null]);
        Http::fake();

        try {
            app(HttpEmbeddingProvider::class)->embed('private text');
            $this->fail('expected an exception');
        } catch (EmbeddingException $e) {
            $this->assertFalse($e->retryable);
        }
        Http::assertNothingSent();
    }

    /** [status, body, retryable] — plain data: providers run before the application (and the Http facade) exists. */
    public static function badAnswers(): array
    {
        return [
            'too few numbers' => [200, ['data' => [['embedding' => [0.1, 0.2]]]], false],
            'too many numbers' => [200, ['data' => [['embedding' => [0, 0, 0, 0, 0]]]], false],
            'a string in the vector' => [200, ['data' => [['embedding' => [0.1, 'x', 0.3, 0.4]]]], false],
            'no embedding at all' => [200, ['data' => []], false],
            'not json' => [200, '<html>oops</html>', false],
            'unauthorized' => [401, ['error' => 'bad key'], false],
            'bad request' => [400, ['error' => 'too long'], false],
            'redirect to elsewhere' => [302, '', false],
            'rate limited' => [429, '', true],
            'server error' => [503, '', true],
        ];
    }

    #[DataProvider('badAnswers')]
    public function test_a_misbehaving_service_becomes_a_clean_exception(int $status, mixed $body, bool $retryable): void
    {
        $this->configure();
        Http::fake(['*' => Http::response($body, $status)]);

        try {
            app(HttpEmbeddingProvider::class)->embed('some memory text');
            $this->fail('expected an EmbeddingException');
        } catch (EmbeddingException $e) {
            $this->assertSame($retryable, $e->retryable);
            // Logs must never carry the user's text or the service's reply.
            $this->assertStringNotContainsString('some memory text', $e->getMessage());
            $this->assertStringNotContainsString('bad key', $e->getMessage());
        }
    }

    public function test_an_unreachable_service_is_a_retryable_failure(): void
    {
        $this->configure();
        Http::fake(fn () => throw new ConnectionException('connection refused'));

        try {
            app(HttpEmbeddingProvider::class)->embed('x');
            $this->fail('expected an EmbeddingException');
        } catch (EmbeddingException $e) {
            $this->assertTrue($e->retryable);
        }
    }

    // ── text preparation ─────────────────────────────────────────────────────

    public function test_text_is_cleaned_and_bounded(): void
    {
        $this->assertSame('a b', MemoryText::clean("a\x00  \x07 b", 100));
        $this->assertSame("one\n\ntwo", MemoryText::clean("one\n\n\n\n\ntwo", 100));
        $this->assertSame('héllo', MemoryText::clean('héllo wörld', 5));
        $this->assertSame('', MemoryText::clean(" \n\t ", 100));
    }

    public function test_the_text_of_a_memory_is_title_body_and_tags_only(): void
    {
        $memory = new Memory(['title' => 'Passport', 'body' => 'renew soon', 'source_url' => 'https://secret.example/path?token=1']);

        $text = MemoryText::for($memory, 2000);

        $this->assertSame("Passport\nrenew soon", $text);
        $this->assertStringNotContainsString('secret.example', $text);
    }

    public function test_the_fingerprint_changes_with_the_text_and_with_the_model(): void
    {
        $a = MemoryText::hash('m1', 'text');
        $this->assertSame($a, MemoryText::hash('m1', 'text'));
        $this->assertNotSame($a, MemoryText::hash('m1', 'other'));
        $this->assertNotSame($a, MemoryText::hash('m2', 'text'));
    }

    public function test_vectors_are_written_in_pgvector_syntax(): void
    {
        $this->assertSame('[0.5,-0.25,0,10]', SemanticSearch::literal([0.5, -0.25, 0.0, 10.0]));
        $this->assertSame('[0.000000123]', SemanticSearch::literal([1.23e-7]));
    }

    // ── "available" means the pipeline really works ──────────────────────────

    public function test_availability_follows_a_real_request_and_failures_are_remembered_briefly(): void
    {
        $this->configure();
        Cache::flush();
        $fake = new FakeEmbeddingProvider(4);
        $this->app->instance(EmbeddingProvider::class, $fake);
        $this->app->forgetInstance(SemanticSearch::class);

        $fake->failWith = 'transient';
        $semantic = app(SemanticSearch::class);
        $this->assertFalse($semantic->providerHealthy());
        $this->assertCount(1, $fake->calls);

        // Remembered: asking again does not hammer a service that is down.
        $this->assertFalse($semantic->providerHealthy());
        $this->assertCount(1, $fake->calls);

        // A successful real embedding clears the failure state.
        $fake->failWith = null;
        $semantic->recordHealth(true);
        $this->assertTrue($semantic->providerHealthy());
        $this->assertCount(1, $fake->calls);
    }

    public function test_a_failing_query_embedding_marks_the_service_unhealthy(): void
    {
        $this->configure();
        Cache::flush();
        $fake = new FakeEmbeddingProvider(4);
        $fake->failWith = 'transient';
        $this->app->instance(EmbeddingProvider::class, $fake);
        $this->app->forgetInstance(SemanticSearch::class);
        $semantic = app(SemanticSearch::class);
        $semantic->recordHealth(true);

        try {
            $semantic->embedQuery('travel');
            $this->fail('expected an EmbeddingException');
        } catch (EmbeddingException) {
        }

        $fake->failWith = null;
        $this->assertFalse($semantic->providerHealthy(), 'cached as failing, so the app stops offering it');
    }
}
