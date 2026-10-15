<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Semantic\EmbeddingProvider;
use App\Semantic\SemanticConfig;
use App\Semantic\SemanticSearch;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\FakeEmbeddingProvider;

/**
 * Semantic search end to end against PostgreSQL + pgvector, with a deterministic fake embedding service (see
 * FakeEmbeddingProvider): these tests prove the pipeline, the ranking/scoping SQL, consent, access control and
 * failure behaviour — not the quality of any real model. They are SKIPPED when pgvector is not installed on the
 * test database (the migration then creates no vector table, which is exactly what a deployment without it sees).
 * The queue is synchronous in tests, so "asynchronous" jobs run inline.
 */
class SemanticSearchApiTest extends ApiTestCase
{
    private FakeEmbeddingProvider $fake;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();

        if (! Schema::hasTable('memory_embeddings')) {
            $this->markTestSkipped('pgvector is not installed on the test database; the vector table was not created.');
        }

        $this->useModel('fake-model');
        $this->fake = new FakeEmbeddingProvider((int) config('echo.semantic.dimensions'));
        $this->app->instance(EmbeddingProvider::class, $this->fake);
        $this->app->forgetInstance(SemanticSearch::class);
        Cache::flush();

        $this->alice = User::factory()->create();
        $this->bob = User::factory()->create();
    }

    private function useModel(string $model): void
    {
        config(['echo.semantic' => array_merge(config('echo.semantic'), [
            'enabled' => true,
            'processing' => 'self-hosted',
            'provider_label' => 'a test server',
            'base_url' => 'http://embeddings.test/v1',
            'model' => $model,
            'max_distance' => 0.6,
            'consent_version' => 1,
        ])]);
        $this->app->forgetInstance(SemanticConfig::class);
        $this->app->forgetInstance(SemanticSearch::class);
    }

    private function optIn(User $user): array
    {
        return $this->as($user)->patchJson('/api/v1/me/semantic-search', [
            'enabled' => true, 'acknowledged' => true, 'consent_version' => 1,
        ])->assertOk()->json('data');
    }

    private function create(User $user, string $title, string $body = ''): string
    {
        return $this->as($user)->postJson('/api/v1/memories', ['type' => 'note', 'title' => $title, 'body' => $body])
            ->assertCreated()->json('data.id');
    }

    /** @return list<string> titles, best first */
    private function semantic(User $user, string $query, string $extra = ''): array
    {
        return $this->as($user)->getJson('/api/v1/search?mode=semantic&q='.urlencode($query).$extra)
            ->assertOk()->assertJsonPath('search.mode', 'semantic')->json('data.*.title');
    }

    /** Texts sent to the fake service, minus the fixed availability probe. */
    private function sentTexts(): array
    {
        return array_values(array_filter($this->fake->calls, fn ($t) => $t !== 'health check'));
    }

    private function vectors(?User $user = null): int
    {
        $query = DB::table('memory_embeddings');

        return $user ? $query->where('user_id', $user->id)->count() : $query->count();
    }

    // ── consent and what is sent ─────────────────────────────────────────────

    public function test_nothing_is_sent_to_the_service_before_the_user_opts_in(): void
    {
        $this->create($this->alice, 'Passport renewal', 'submit the form');

        $this->assertSame([], $this->sentTexts());
        $this->assertSame(0, $this->vectors());

        $status = $this->as($this->alice)->getJson('/api/v1/me/semantic-search')->assertOk()->json('data');
        $this->assertTrue($status['available']);
        $this->assertSame('off', $status['state']);
        $this->assertFalse($status['enabled']);
        $this->assertStringContainsString('a test server', $status['disclosure']);
    }

    public function test_opting_in_indexes_existing_memories_and_only_then_reports_ready(): void
    {
        $this->create($this->alice, 'Passport renewal');
        $this->create($this->alice, 'Dentist checkup');

        $status = $this->optIn($this->alice);

        $this->assertSame('ready', $status['state']);
        $this->assertSame(2, $status['indexed']);
        $this->assertSame(2, $status['total']);
        $this->assertSame(2, $this->vectors($this->alice));
        $this->assertNotNull($this->alice->fresh()->semantic_search_opt_in_at);
    }

    public function test_the_text_sent_is_title_body_and_tags_and_never_a_link_or_other_fields(): void
    {
        $this->optIn($this->alice);
        $this->as($this->alice)->postJson('/api/v1/memories', [
            'type' => 'link', 'title' => 'Travel guide', 'body' => 'flights', 'source_url' => 'https://private.example/x?token=abc', 'tags' => ['trip'],
        ])->assertCreated();

        $sent = implode("\n", $this->sentTexts());
        $this->assertStringContainsString('Travel guide', $sent);
        $this->assertStringContainsString('Tags: trip', $sent);
        $this->assertStringNotContainsString('private.example', $sent);
    }

    public function test_opting_out_deletes_every_vector_and_stops_indexing(): void
    {
        $this->create($this->alice, 'Passport renewal');
        $this->optIn($this->alice);
        $this->assertSame(1, $this->vectors($this->alice));

        $this->as($this->alice)->patchJson('/api/v1/me/semantic-search', ['enabled' => false])
            ->assertOk()->assertJsonPath('data.state', 'off')->assertJsonPath('data.enabled', false);

        $this->assertSame(0, $this->vectors($this->alice));
        $this->fake->calls = [];
        $this->create($this->alice, 'Visa paperwork');
        $this->assertSame([], $this->sentTexts());
        $this->assertSame(0, $this->vectors($this->alice));
    }

    public function test_consent_to_an_older_disclosure_does_not_count(): void
    {
        $this->as($this->alice)->patchJson('/api/v1/me/semantic-search', [
            'enabled' => true, 'acknowledged' => true, 'consent_version' => 99,
        ])->assertStatus(422);
        $this->assertNull($this->alice->fresh()->semantic_search_opt_in_at);

        $this->optIn($this->alice);
        $this->useModel('fake-model');
        config(['echo.semantic.consent_version' => 2]);
        $this->app->forgetInstance(SemanticConfig::class);
        $this->app->forgetInstance(SemanticSearch::class);

        // The disclosure changed: the old opt-in is void until the user agrees again.
        $this->as($this->alice)->getJson('/api/v1/me/semantic-search')->assertJsonPath('data.state', 'off');
    }

    // ── relevance ────────────────────────────────────────────────────────────

    public function test_it_finds_memories_by_meaning_where_text_search_finds_nothing(): void
    {
        $this->optIn($this->alice);
        $this->create($this->alice, 'Passport renewal', 'submit the form');
        $this->create($this->alice, 'Dentist checkup', 'every six months');
        $this->create($this->alice, 'Sourdough starter', 'flour and water');
        $this->create($this->alice, 'Gym plan', 'leg day');

        // No word in common with the memory, same concept.
        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'visa for my trip abroad'));
        $this->assertSame([], $this->as($this->alice)->getJson('/api/v1/search?q='.urlencode('visa trip abroad'))->json('data.*.title'));

        $this->assertSame(['Dentist checkup'], $this->semantic($this->alice, 'doctor'));
        $this->assertSame(['Sourdough starter'], $this->semantic($this->alice, 'baking bread'));
    }

    public function test_a_query_with_nothing_in_common_returns_nothing_rather_than_the_least_bad_match(): void
    {
        $this->optIn($this->alice);
        $this->create($this->alice, 'Passport renewal');

        $this->assertSame([], $this->semantic($this->alice, 'quantum chromodynamics'));
    }

    public function test_results_are_ranked_by_closeness_and_mixed_queries_reach_both_concepts(): void
    {
        $this->optIn($this->alice);
        $this->create($this->alice, 'Passport renewal');
        $this->create($this->alice, 'Dentist checkup');
        $this->create($this->alice, 'Sourdough starter');

        $this->assertEqualsCanonicalizing(['Passport renewal', 'Dentist checkup'], $this->semantic($this->alice, 'doctor abroad'));
        // Two travel words and one health word: travel is nearer.
        $this->assertSame(['Passport renewal', 'Dentist checkup'], $this->semantic($this->alice, 'travel flight doctor'));
    }

    public function test_filters_still_narrow_semantic_results(): void
    {
        $this->optIn($this->alice);
        $id = $this->create($this->alice, 'Passport renewal');
        $this->create($this->alice, 'Visa paperwork');
        $this->as($this->alice)->patchJson("/api/v1/memories/{$id}", ['favorite' => true])->assertOk();

        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'travel', '&favorite=1'));
        $this->assertSame([], $this->semantic($this->alice, 'travel', '&type=idea'));
    }

    public function test_semantic_results_do_not_expose_vectors(): void
    {
        $this->optIn($this->alice);
        $this->create($this->alice, 'Passport renewal');

        $response = $this->as($this->alice)->getJson('/api/v1/search?mode=semantic&q=travel')->assertOk();

        $this->assertStringNotContainsString('embedding', strtolower($response->getContent()));
        $this->assertStringNotContainsString('distance', strtolower($response->getContent()));
    }

    // ── access control ───────────────────────────────────────────────────────

    public function test_one_users_semantic_search_never_returns_another_users_memories(): void
    {
        $this->optIn($this->alice);
        $this->optIn($this->bob);
        $this->create($this->alice, 'Passport renewal', 'alice secret');
        $this->create($this->bob, 'Visa application');

        $this->assertSame(['Visa application'], $this->semantic($this->bob, 'passport'));
        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'visa'));
    }

    public function test_a_user_who_has_not_opted_in_is_never_indexed_even_when_others_are(): void
    {
        $this->optIn($this->bob);
        $this->create($this->alice, 'Passport renewal');
        $this->create($this->bob, 'Visa application');

        $this->assertSame(0, $this->vectors($this->alice));
        $this->assertSame(1, $this->vectors($this->bob));
        $this->assertNotContains('Passport renewal', $this->sentTexts());
    }

    public function test_the_database_refuses_a_vector_that_points_at_someone_elses_memory(): void
    {
        $this->optIn($this->alice);
        $aliceMemory = $this->create($this->alice, 'Passport renewal');
        $literal = SemanticSearch::literal(array_fill(0, (int) config('echo.semantic.dimensions'), 0.0));

        $this->expectException(QueryException::class);
        DB::statement(
            'INSERT INTO memory_embeddings (memory_id, user_id, model, content_hash, embedding, embedded_at) VALUES (?, ?, ?, ?, ?::vector, now())',
            [$aliceMemory, $this->bob->id, 'fake-model', str_repeat('a', 64), $literal],
        );
    }

    public function test_status_and_settings_are_per_user(): void
    {
        $this->optIn($this->alice);

        $this->as($this->bob)->getJson('/api/v1/me/semantic-search')->assertJsonPath('data.enabled', false)->assertJsonPath('data.state', 'off');
        $this->as($this->bob)->patchJson('/api/v1/me/semantic-search', ['enabled' => false])->assertOk();

        $this->assertNotNull($this->alice->fresh()->semantic_search_opt_in_at, 'bob switching off must not touch alice');
    }

    public function test_trashing_removes_a_memory_from_semantic_results_and_restoring_brings_it_back(): void
    {
        $this->optIn($this->alice);
        $id = $this->create($this->alice, 'Passport renewal');
        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'travel'));

        $this->as($this->alice)->deleteJson("/api/v1/memories/{$id}")->assertNoContent();
        $this->assertSame([], $this->semantic($this->alice, 'travel'));
        $this->assertSame(0, $this->vectors($this->alice));

        $this->as($this->alice)->postJson("/api/v1/memories/{$id}/restore")->assertOk();
        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'travel'));

        $this->as($this->alice)->deleteJson("/api/v1/memories/{$id}")->assertNoContent();
        $this->as($this->alice)->deleteJson("/api/v1/memories/{$id}/force")->assertNoContent();
        $this->assertSame(0, $this->vectors($this->alice));
    }

    public function test_deleting_the_account_deletes_the_vectors(): void
    {
        $this->optIn($this->alice);
        $this->create($this->alice, 'Passport renewal');
        $this->assertSame(1, $this->vectors($this->alice));

        $this->as($this->alice)->deleteJson('/api/v1/me', ['password' => 'password'])->assertNoContent();

        $this->assertSame(0, DB::table('memory_embeddings')->count());
    }

    // ── failure handling ─────────────────────────────────────────────────────

    public function test_it_refuses_to_switch_on_while_the_embedding_service_is_down(): void
    {
        $this->fake->failWith = 'transient';

        $this->as($this->alice)->patchJson('/api/v1/me/semantic-search', ['enabled' => true, 'acknowledged' => true, 'consent_version' => 1])
            ->assertStatus(409)->assertJsonPath('reason', 'provider_down');

        $this->assertNull($this->alice->fresh()->semantic_search_opt_in_at);
        $this->as($this->alice)->getJson('/api/v1/me/semantic-search')
            ->assertJsonPath('data.available', false)->assertJsonPath('data.state', 'unavailable');
    }

    public function test_saving_a_memory_still_works_when_the_embedding_service_fails(): void
    {
        $this->optIn($this->alice);
        $this->fake->failWith = 'transient';

        $id = $this->create($this->alice, 'Passport renewal');

        $this->assertDatabaseHas('memories', ['id' => $id, 'title' => 'Passport renewal']);
        $this->assertSame(0, $this->vectors($this->alice), 'no vector was invented');

        $this->fake->failWith = 'permanent';
        $this->create($this->alice, 'Visa paperwork'); // a rejected request must not break saving either
        $this->assertSame(0, $this->vectors($this->alice));
    }

    public function test_a_failing_service_at_search_time_falls_back_to_text_search_and_says_so(): void
    {
        $this->optIn($this->alice);
        $this->create($this->alice, 'Passport renewal', 'renew soon');
        $this->fake->failWith = 'transient';

        $response = $this->as($this->alice)->getJson('/api/v1/search?mode=semantic&q=renew')->assertOk();

        $response->assertJsonPath('search.mode', 'text')->assertJsonPath('search.fallback_reason', 'provider_error');
        $this->assertSame(['Passport renewal'], $response->json('data.*.title'), 'normal text search still answers');

        // And the app stops offering it until the service is back.
        $this->as($this->alice)->getJson('/api/v1/me/semantic-search')
            ->assertJsonPath('data.available', false)->assertJsonPath('data.reason', 'provider_down');
        $this->as($this->alice)->getJson('/api/v1/search?mode=semantic&q=renew')
            ->assertJsonPath('search.mode', 'text')->assertJsonPath('search.fallback_reason', 'provider_down');
    }

    public function test_asking_for_semantic_search_without_opting_in_gets_text_results_and_the_reason(): void
    {
        $this->create($this->alice, 'Passport renewal', 'renew soon');

        $this->as($this->alice)->getJson('/api/v1/search?mode=semantic&q=renew')
            ->assertOk()
            ->assertJsonPath('search.mode', 'text')
            ->assertJsonPath('search.fallback_reason', 'not_enabled')
            ->assertJsonPath('data.0.title', 'Passport renewal');
    }

    public function test_normal_text_search_is_unchanged_and_reports_its_mode(): void
    {
        $this->create($this->alice, 'Passport renewal', 'renew soon');

        $this->as($this->alice)->getJson('/api/v1/search?q=renew')
            ->assertOk()->assertJsonPath('search.mode', 'text')->assertJsonPath('search.fallback_reason', null)
            ->assertJsonPath('data.0.title', 'Passport renewal');
    }

    // ── keeping vectors in step ──────────────────────────────────────────────

    public function test_unchanged_text_is_not_embedded_again_and_edits_are(): void
    {
        $this->optIn($this->alice);
        $id = $this->create($this->alice, 'Passport renewal', 'submit the form');
        $this->fake->calls = [];

        $this->as($this->alice)->patchJson("/api/v1/memories/{$id}", ['favorite' => true])->assertOk();
        $this->as($this->alice)->patchJson("/api/v1/memories/{$id}", ['title' => 'Passport renewal'])->assertOk();
        $this->as($this->alice)->postJson("/api/v1/memories/{$id}/open")->assertOk();
        $this->assertSame([], $this->sentTexts(), 'starring, opening and saving identical text cost nothing');

        $this->as($this->alice)->patchJson("/api/v1/memories/{$id}", ['body' => 'now it is about a dentist'])->assertOk();
        $this->assertCount(1, $this->sentTexts());
        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'doctor'), 'the new text is what is searched');
    }

    public function test_vectors_from_an_older_model_are_not_used_until_the_backfill_replaces_them(): void
    {
        $this->optIn($this->alice);
        $this->create($this->alice, 'Passport renewal');
        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'travel'));

        $this->useModel('fake-model-2');

        $status = $this->as($this->alice)->getJson('/api/v1/me/semantic-search')->assertOk()->json('data');
        $this->assertSame('indexing', $status['state']);
        $this->assertSame(0, $status['indexed']);
        $this->as($this->alice)->getJson('/api/v1/search?mode=semantic&q=travel')
            ->assertJsonPath('search.mode', 'semantic')->assertJsonPath('search.complete', false)->assertJsonPath('data', []);

        Artisan::call('echo:embed-backfill');

        $this->as($this->alice)->getJson('/api/v1/me/semantic-search')->assertJsonPath('data.state', 'ready');
        $this->assertSame(['Passport renewal'], $this->semantic($this->alice, 'travel'));
    }
}
