<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Support\SearchTerms;

class SearchApiTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    private function search(string $q, string $extra = ''): array
    {
        return $this->getJson('/api/v1/search?q='.urlencode($q).$extra)->assertOk()->json('data.*.title');
    }

    private function note(string $title, string $body = '', array $tags = [], array $extra = []): string
    {
        return $this->postJson('/api/v1/memories', array_merge(['type' => 'note', 'title' => $title, 'body' => $body, 'tags' => $tags], $extra))
            ->assertCreated()->json('data.id');
    }

    public function test_it_finds_memories_by_title_and_by_content(): void
    {
        $this->note('Passport renewal', 'book an appointment');
        $this->note('Gym plan', 'renew membership in March');
        $this->note('Unrelated', 'nothing here');

        $this->assertEqualsCanonicalizing(['Passport renewal', 'Gym plan'], $this->search('renew'));
        $this->assertSame(['Passport renewal'], $this->search('appointment'));
        $this->assertSame([], $this->search('zebra'));
    }

    public function test_it_finds_memories_by_tag(): void
    {
        $this->note('Quarterly goals', '', ['finance']);
        $this->note('Other', '');

        $this->assertSame(['Quarterly goals'], $this->search('finance'));
    }

    public function test_title_matches_outrank_content_matches(): void
    {
        $this->note('Meeting notes', 'we discussed the roadmap briefly');
        $this->note('Roadmap', 'planning for next year');
        $this->note('Groceries', 'milk, eggs, roadmap for dinner');

        $this->assertSame('Roadmap', $this->search('roadmap')[0]);
    }

    public function test_every_term_must_match_and_the_last_word_matches_as_a_prefix(): void
    {
        $this->note('Passport renewal', 'book an appointment');
        $this->note('Passport photos', 'need two');

        $this->assertSame(['Passport renewal'], $this->search('passport appointment'));
        $this->assertEqualsCanonicalizing(['Passport renewal', 'Passport photos'], $this->search('pass'));  // prefix
        $this->assertSame(['Passport renewal'], $this->search('passport ren'));                              // search-as-you-type
        $this->assertSame([], $this->search('passport zebra'));
    }

    public function test_it_is_case_insensitive_and_handles_accents_and_other_scripts_as_plain_letters(): void
    {
        $this->note('Café ideas');
        $this->note('日本語のメモ');

        $this->assertSame(['Café ideas'], $this->search('CAFÉ'));
        $this->assertSame(['日本語のメモ'], $this->search('日本語のメモ'));
    }

    public function test_search_input_can_never_break_the_query(): void
    {
        $this->note('Normal note', "O'Brien & friends");

        foreach (["'", '"', '&', '|', '!', ':*', '(', ')', '<->', "a' OR '1'='1", '; DROP TABLE memories;--', '%', '_', '\\', 'a:*b', '!!!', str_repeat('a', 200)] as $nasty) {
            $this->getJson('/api/v1/search?q='.urlencode($nasty))->assertOk();
        }
        $this->assertDatabaseCount('memories', 1);
        $this->assertSame(['Normal note'], $this->search("O'Brien"));
    }

    public function test_a_query_with_no_searchable_characters_matches_nothing(): void
    {
        $this->note('Something');
        $this->assertSame([], $this->search('!!!'));
    }

    public function test_the_query_is_required_and_bounded(): void
    {
        $this->getJson('/api/v1/search')->assertUnprocessable()->assertJsonValidationErrors(['q']);
        $this->getJson('/api/v1/search?q=')->assertUnprocessable();
        $this->getJson('/api/v1/search?q='.str_repeat('a', 201))->assertUnprocessable();
    }

    public function test_filters_narrow_the_results(): void
    {
        $c = $this->user->collections()->create(['name' => 'C']);
        $this->note('Alpha idea', '', [], ['type' => 'idea', 'favorite' => true]);
        $this->note('Alpha note', '', [], ['collection_id' => $c->id]);
        $this->note('Alpha tagged', '', ['special']);

        $this->assertCount(3, $this->search('alpha'));
        $this->assertSame(['Alpha idea'], $this->search('alpha', '&type=idea'));
        $this->assertSame(['Alpha idea'], $this->search('alpha', '&favorite=1'));
        $this->assertSame(['Alpha note'], $this->search('alpha', "&collection_id={$c->id}"));
        $this->assertSame(['Alpha tagged'], $this->search('alpha', '&tag=special'));
        $this->assertSame([], $this->search('alpha', '&type=link'));
    }

    public function test_trashed_memories_are_not_searchable(): void
    {
        $id = $this->note('Secret plan');
        $this->deleteJson("/api/v1/memories/{$id}");

        $this->assertSame([], $this->search('secret'));

        $this->postJson("/api/v1/memories/{$id}/restore");
        $this->assertSame(['Secret plan'], $this->search('secret'));
    }

    public function test_search_never_returns_another_users_memories_or_tags(): void
    {
        $other = User::factory()->create();
        $this->memory($other, ['title' => 'Confidential merger', 'body' => 'merger details']);
        $this->as($other)->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'tags' => ['merger']]);
        $this->as($this->user);
        $this->note('My own merger note');

        $this->assertSame(['My own merger note'], $this->search('merger'));
    }

    public function test_updates_are_searchable_immediately(): void
    {
        $id = $this->note('Old title');
        $this->patchJson("/api/v1/memories/{$id}", ['title' => 'Brand new words']);

        $this->assertSame([], $this->search('old'));
        $this->assertSame(['Brand new words'], $this->search('brand'));
    }

    public function test_results_are_paginated_and_use_the_lean_representation(): void
    {
        foreach (range(1, 30) as $i) {
            $this->note("Findable {$i}", str_repeat('x', 400));
        }

        $page = $this->getJson('/api/v1/search?q=findable&per_page=10&page=2')->assertOk()
            ->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 30)->assertJsonPath('meta.current_page', 2);

        $this->assertArrayNotHasKey('body', $page->json('data.0'));
        $this->assertArrayNotHasKey('search_vector', $page->json('data.0'));
        $this->assertArrayNotHasKey('rank', $page->json('data.0'));
        $this->assertCount(30, collect([1, 2, 3])->flatMap(fn ($p) => $this->getJson("/api/v1/search?q=findable&per_page=10&page={$p}")->json('data.*.id'))->unique());
    }

    public function test_search_does_not_run_n_plus_one_queries(): void
    {
        foreach (range(1, 3) as $i) {
            $this->note("Findable {$i}", '', ['t1']);
        }
        $few = $this->queryCount(fn () => $this->getJson('/api/v1/search?q=findable')->assertOk());
        foreach (range(4, 25) as $i) {
            $this->note("Findable {$i}", '', ['t1', "t{$i}"]);
        }
        $many = $this->queryCount(fn () => $this->getJson('/api/v1/search?q=findable')->assertOk());

        $this->assertSame($few, $many);
    }

    public function test_the_search_uses_the_gin_index(): void
    {
        // Force the planner away from a sequential scan so the test is deterministic on a tiny table.
        \DB::statement('SET enable_seqscan = off');
        $plan = collect(\DB::select("EXPLAIN SELECT id FROM memories WHERE search_vector @@ to_tsquery('simple', 'passport:*')"))
            ->pluck('QUERY PLAN')->implode("\n");
        \DB::statement('SET enable_seqscan = on');

        $this->assertStringContainsString('memories_search_vector_gin', $plan);
    }

    public function test_search_requires_authentication(): void
    {
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', '')->getJson('/api/v1/search?q=a')->assertUnauthorized();
    }

    public function test_term_parsing(): void
    {
        $this->assertSame(['hello', 'world'], SearchTerms::parse('  Hello,  WORLD!! '));
        $this->assertSame([], SearchTerms::parse("&|!:*()'<>"));
        $this->assertSame(['a'], SearchTerms::parse('a a A'));
        $this->assertCount(SearchTerms::MAX_TERMS, SearchTerms::parse(implode(' ', range(1, 50))));
        $this->assertSame('pass:* & ren:*', SearchTerms::tsquery(['pass', 'ren']));
    }
}
