<?php

namespace Tests\Feature;

use App\Models\Memory;
use App\Models\MemoryLink;
use App\Models\User;
use App\Services\TagSync;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_seeder_creates_a_usable_demo_account_and_is_repeatable(): void
    {
        putenv('DEMO_USER_PASSWORD=a-test-only-password');
        $_ENV['DEMO_USER_PASSWORD'] = 'a-test-only-password';

        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class); // running twice must not duplicate anything

        $this->assertSame(1, User::count());
        $user = User::firstWhere('email', 'demo@echo.test');
        $this->assertTrue(Hash::check('a-test-only-password', $user->password));
        $this->assertSame(6, Memory::count());
        $this->assertSame(3, MemoryLink::count());
        $this->assertSame(3, $user->collections()->count());

        // The seeded data is searchable straight away (the generated search column).
        $this->assertSame(1, Memory::query()->search('passport', $user->id)->count());
    }

    public function test_without_a_configured_password_one_is_generated_not_hard_coded(): void
    {
        putenv('DEMO_USER_PASSWORD');
        unset($_ENV['DEMO_USER_PASSWORD'], $_SERVER['DEMO_USER_PASSWORD']);

        $this->seed(DatabaseSeeder::class);

        $user = User::firstWhere('email', 'demo@echo.test');
        foreach (['password', 'secret', 'demo', 'echo', 'a-test-only-password'] as $guess) {
            $this->assertFalse(Hash::check($guess, $user->password));
        }
    }

    public function test_the_seeder_refuses_to_run_in_production(): void
    {
        $this->app->detectEnvironment(fn () => 'production');

        // (`db:seed` also asks for confirmation in production; this checks the seeder's own guard.)
        app(DatabaseSeeder::class)->run(app(TagSync::class));

        $this->assertSame(0, User::count());
    }
}
