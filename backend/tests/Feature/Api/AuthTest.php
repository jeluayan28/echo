<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Memory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery';

    private function register(array $over = []): TestResponse
    {
        return $this->postJson('/api/v1/auth/register', array_merge([
            'name' => 'Jelli',
            'email' => 'jelli@example.com',
            'password' => self::PASSWORD,
            'password_confirmation' => self::PASSWORD,
        ], $over));
    }

    private function token(string $email = 'jelli@example.com'): string
    {
        return $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => self::PASSWORD])->json('data.token');
    }

    /** Sanctum caches the resolved user inside the guard; forget it so the next request re-authenticates. */
    private function freshRequest(): static
    {
        $this->app['auth']->forgetGuards();

        return $this;
    }

    // ── registration ─────────────────────────────────────────────────────────

    public function test_a_user_can_register_and_receives_a_bearer_token(): void
    {
        $response = $this->register()->assertCreated()
            ->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email', 'created_at'], 'token', 'token_type', 'expires_at']])
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user.email', 'jelli@example.com');

        $this->assertStringNotContainsString('password', $response->getContent());
        $this->assertNotEmpty($response->json('data.token'));
    }

    public function test_passwords_are_stored_hashed_and_tokens_are_stored_as_hashes(): void
    {
        $token = $this->register()->json('data.token');
        $user = User::firstWhere('email', 'jelli@example.com');

        $this->assertNotSame(self::PASSWORD, $user->password);
        $this->assertTrue(Hash::check(self::PASSWORD, $user->password));
        // The plain-text token (id|secret) must not be what's persisted.
        $this->assertDatabaseMissing('personal_access_tokens', ['token' => $token]);
        $this->assertDatabaseMissing('personal_access_tokens', ['token' => explode('|', $token)[1]]);
    }

    public function test_registration_validates_its_input(): void
    {
        $this->register(['name' => '', 'email' => 'not-an-email', 'password' => 'short', 'password_confirmation' => 'other'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'password']);
    }

    public function test_registration_requires_a_confirmed_password(): void
    {
        $this->register(['password_confirmation' => 'different-password'])
            ->assertUnprocessable()->assertJsonValidationErrors(['password']);
    }

    public function test_emails_are_unique_regardless_of_case(): void
    {
        $this->register()->assertCreated();
        $this->register(['email' => 'JELLI@Example.com'])->assertUnprocessable()->assertJsonValidationErrors(['email']);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_the_email_is_stored_lowercase(): void
    {
        $this->register(['email' => '  Mixed@Example.COM '])->assertCreated();
        $this->assertDatabaseHas('users', ['email' => 'mixed@example.com']);
    }

    // ── login ────────────────────────────────────────────────────────────────

    public function test_a_user_can_log_in(): void
    {
        $this->register();

        $this->postJson('/api/v1/auth/login', ['email' => 'JELLI@example.com', 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonStructure(['data' => ['user', 'token', 'token_type', 'expires_at']]);
    }

    public function test_wrong_password_and_unknown_email_look_the_same(): void
    {
        $this->register();

        $wrong = $this->postJson('/api/v1/auth/login', ['email' => 'jelli@example.com', 'password' => 'nope-nope-nope']);
        $unknown = $this->postJson('/api/v1/auth/login', ['email' => 'ghost@example.com', 'password' => 'nope-nope-nope']);

        $wrong->assertUnauthorized();
        $unknown->assertUnauthorized();
        $this->assertSame($wrong->json(), $unknown->json()); // no account enumeration
    }

    public function test_login_is_rate_limited_per_account_and_ip(): void
    {
        $this->register();
        RateLimiter::clear('jelli@example.com|127.0.0.1');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'jelli@example.com', 'password' => 'wrong-password'])->assertUnauthorized();
        }

        $this->postJson('/api/v1/auth/login', ['email' => 'jelli@example.com', 'password' => 'wrong-password'])
            ->assertStatus(429)->assertHeader('Retry-After');
        // ...even with the right password, until the window passes.
        $this->postJson('/api/v1/auth/login', ['email' => 'jelli@example.com', 'password' => self::PASSWORD])->assertStatus(429);
    }

    public function test_registration_is_rate_limited_per_ip(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->register(['email' => "user{$i}@example.com"])->assertCreated();
        }
        $this->register(['email' => 'one-too-many@example.com'])->assertStatus(429);
    }

    // ── authenticated access ─────────────────────────────────────────────────

    public function test_protected_routes_reject_anonymous_requests_with_json(): void
    {
        $this->getJson('/api/v1/me')->assertUnauthorized()->assertJson(['message' => 'Unauthenticated.']);
        // ...even if the client forgot the Accept header.
        $this->get('/api/v1/me')->assertUnauthorized()->assertHeader('Content-Type', 'application/json');
    }

    public function test_garbage_and_revoked_tokens_are_rejected(): void
    {
        $this->withToken('1|not-a-real-token')->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_the_current_user_endpoint_returns_only_public_fields(): void
    {
        $token = $this->register()->json('data.token');

        $this->freshRequest()->withToken($token)->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'jelli@example.com')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.remember_token');
    }

    public function test_an_expired_token_is_rejected(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('old', ['*'], now()->subMinute())->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_tokens_expire_after_the_configured_lifetime(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('old')->plainTextToken;
        $user->tokens()->update(['created_at' => now()->subMinutes(config('sanctum.expiration') + 1)]);

        $this->withToken($token)->getJson('/api/v1/me')->assertUnauthorized();
    }

    // ── logout ───────────────────────────────────────────────────────────────

    public function test_logout_revokes_only_the_token_used(): void
    {
        $this->register();
        $phone = $this->token();
        $tablet = $this->token();

        $this->freshRequest()->withToken($phone)->postJson('/api/v1/auth/logout')->assertOk();

        $this->freshRequest()->withToken($phone)->getJson('/api/v1/me')->assertUnauthorized();
        $this->freshRequest()->withToken($tablet)->getJson('/api/v1/me')->assertOk();
    }

    public function test_logout_requires_authentication(): void
    {
        $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
    }

    // ── profile ──────────────────────────────────────────────────────────────

    public function test_the_name_can_be_updated_without_a_password(): void
    {
        $this->register();
        $token = $this->token();

        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me', ['name' => 'New Name'])
            ->assertOk()->assertJsonPath('data.name', 'New Name');
    }

    public function test_changing_the_email_requires_the_current_password(): void
    {
        $this->register();
        $token = $this->token();

        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me', ['email' => 'new@example.com'])
            ->assertUnprocessable()->assertJsonValidationErrors(['current_password']);
        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me', ['email' => 'new@example.com', 'current_password' => 'wrong-password'])
            ->assertUnprocessable()->assertJsonValidationErrors(['current_password']);
        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me', ['email' => 'new@example.com', 'current_password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('data.email', 'new@example.com');
    }

    public function test_the_email_cannot_be_changed_to_one_already_taken(): void
    {
        $this->register();
        User::factory()->create(['email' => 'taken@example.com']);
        $token = $this->token();

        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me', ['email' => 'Taken@example.com', 'current_password' => self::PASSWORD])
            ->assertUnprocessable()->assertJsonValidationErrors(['email']);
    }

    public function test_changing_the_password_signs_out_other_devices_but_not_this_one(): void
    {
        $this->register();
        $phone = $this->token();
        $tablet = $this->token();

        $this->freshRequest()->withToken($phone)->patchJson('/api/v1/me', [
            'password' => 'a-brand-new-password',
            'password_confirmation' => 'a-brand-new-password',
            'current_password' => self::PASSWORD,
        ])->assertOk();

        $this->freshRequest()->withToken($phone)->getJson('/api/v1/me')->assertOk();
        $this->freshRequest()->withToken($tablet)->getJson('/api/v1/me')->assertUnauthorized();
        $this->postJson('/api/v1/auth/login', ['email' => 'jelli@example.com', 'password' => 'a-brand-new-password'])->assertOk();
    }

    public function test_deleting_the_account_requires_the_password_and_removes_everything(): void
    {
        Storage::fake('local');
        $this->register();
        $token = $this->token();
        $user = User::firstWhere('email', 'jelli@example.com');
        $memory = Memory::factory()->forUser($user)->create();
        Storage::disk('local')->put('attachments/x.m4a', 'audio');
        Attachment::factory()->create(['user_id' => $user->id, 'memory_id' => $memory->id, 'path' => 'attachments/x.m4a']);

        $this->freshRequest()->withToken($token)->deleteJson('/api/v1/me', ['password' => 'wrong-password'])
            ->assertUnprocessable()->assertJsonValidationErrors(['password']);
        $this->assertDatabaseHas('users', ['id' => $user->id]);

        $this->freshRequest()->withToken($token)->deleteJson('/api/v1/me', ['password' => self::PASSWORD])->assertNoContent();

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('memories', 0);
        $this->assertDatabaseCount('attachments', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        Storage::disk('local')->assertMissing('attachments/x.m4a');
    }

    // ── notification preferences ─────────────────────────────────────────────

    public function test_notification_preferences_have_defaults_and_can_be_updated(): void
    {
        $this->register();
        $token = $this->token();

        $this->freshRequest()->withToken($token)->getJson('/api/v1/me/preferences')
            ->assertOk()->assertExactJson(['data' => [
                'reminders_enabled' => true, 'timezone' => 'UTC', 'quiet_hours_start' => null, 'quiet_hours_end' => null,
            ]]);

        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me/preferences', [
            'timezone' => 'Europe/Berlin', 'reminders_enabled' => false, 'quiet_hours_start' => '22:00', 'quiet_hours_end' => '07:30',
        ])->assertOk()->assertJsonPath('data.timezone', 'Europe/Berlin')->assertJsonPath('data.quiet_hours_end', '07:30');

        $this->assertDatabaseCount('notification_preferences', 1);
    }

    public function test_notification_preferences_are_validated(): void
    {
        $this->register();
        $token = $this->token();

        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me/preferences', ['timezone' => 'Mars/Olympus'])
            ->assertUnprocessable()->assertJsonValidationErrors(['timezone']);
        $this->freshRequest()->withToken($token)->patchJson('/api/v1/me/preferences', ['quiet_hours_start' => '22:00'])
            ->assertUnprocessable()->assertJsonValidationErrors(['quiet_hours_end']);
    }

    public function test_preferences_belong_to_the_authenticated_user_only(): void
    {
        $this->register();
        $mine = $this->token();
        $other = User::factory()->create();
        $other->notificationPreference()->create(['timezone' => 'Asia/Tokyo']);

        $this->freshRequest()->withToken($mine)->getJson('/api/v1/me/preferences')->assertJsonPath('data.timezone', 'UTC');
    }

    // ── API behaviour ────────────────────────────────────────────────────────

    public function test_unknown_api_routes_return_json_404(): void
    {
        $this->get('/api/v1/nope')->assertNotFound()->assertJson(['message' => 'Resource not found.']);
    }

    public function test_cors_allows_only_configured_origins(): void
    {
        $this->options('/api/v1/auth/login', [], [
            'Origin' => 'http://localhost:8081',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'content-type,authorization',
        ])->assertNoContent()->assertHeader('Access-Control-Allow-Origin', 'http://localhost:8081');

        $evil = $this->options('/api/v1/auth/login', [], [
            'Origin' => 'https://evil.example',
            'Access-Control-Request-Method' => 'POST',
        ]);
        // The browser compares this header with its own origin: it must never echo an unlisted origin or '*'.
        $this->assertNotSame('https://evil.example', $evil->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $evil->headers->get('Access-Control-Allow-Origin'));
    }
}
