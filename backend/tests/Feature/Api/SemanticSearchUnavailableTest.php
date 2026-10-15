<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Semantic\SemanticConfig;
use App\Semantic\SemanticSearch;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The app must never offer, or pretend to have, semantic search that does not work. These checks need no
 * database: they cover the "not configured" and consent rules, which are decided before anything is queried.
 */
class SemanticSearchUnavailableTest extends TestCase
{
    private function signIn(): User
    {
        $user = new User(['name' => 'Alice', 'email' => 'alice@example.test']);
        $user->id = 1;
        Sanctum::actingAs($user, ['*']);

        return $user;
    }

    private function useConfig(array $overrides): void
    {
        config(['echo.semantic' => array_merge(config('echo.semantic'), $overrides)]);
        $this->app->forgetInstance(SemanticConfig::class);
        $this->app->forgetInstance(SemanticSearch::class);
    }

    public function test_it_requires_a_signed_in_user(): void
    {
        $this->getJson('/api/v1/me/semantic-search')->assertUnauthorized();
        $this->patchJson('/api/v1/me/semantic-search', ['enabled' => true])->assertUnauthorized();
    }

    public function test_the_default_install_says_it_is_unavailable_and_does_not_reveal_provider_details(): void
    {
        $this->signIn();

        $data = $this->getJson('/api/v1/me/semantic-search')->assertOk()->json('data');

        $this->assertFalse($data['available']);
        $this->assertSame('unavailable', $data['state']);
        $this->assertSame('not_configured', $data['reason']);
        $this->assertFalse($data['enabled']);
        $this->assertNull($data['disclosure'], 'nothing is processed, so there is nothing to disclose');
        $this->assertNull($data['processing']);
    }

    public function test_a_server_that_never_said_where_text_is_processed_stays_unavailable(): void
    {
        $this->useConfig([
            'enabled' => true, 'processing' => null, 'base_url' => 'https://api.example.com/v1',
            'model' => 'm', 'dimensions' => 4,
        ]);
        $this->signIn();

        $this->getJson('/api/v1/me/semantic-search')->assertOk()
            ->assertJsonPath('data.available', false)
            ->assertJsonPath('data.reason', 'not_configured');
    }

    public function test_turning_it_on_is_refused_while_the_pipeline_is_not_working(): void
    {
        $this->signIn();

        $this->patchJson('/api/v1/me/semantic-search', [
            'enabled' => true, 'acknowledged' => true, 'consent_version' => config('echo.semantic.consent_version'),
        ])->assertStatus(409)->assertJsonPath('reason', 'not_configured');
    }

    public function test_consent_to_the_current_explanation_is_required(): void
    {
        $this->signIn();

        $this->patchJson('/api/v1/me/semantic-search', ['enabled' => true])->assertStatus(422);
        $this->patchJson('/api/v1/me/semantic-search', ['enabled' => true, 'acknowledged' => false, 'consent_version' => 1])->assertStatus(422);
        $this->patchJson('/api/v1/me/semantic-search', ['enabled' => true, 'acknowledged' => true, 'consent_version' => 999])->assertStatus(422);
        $this->patchJson('/api/v1/me/semantic-search', ['enabled' => 'banana'])->assertStatus(422);
    }
}
