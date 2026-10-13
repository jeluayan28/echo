<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Outside production, lazy loading throws: an N+1 query is a failing test, not a slow endpoint.
        Model::preventLazyLoading(! $this->app->isProduction());
        // Mass-assignment of an unknown attribute should be loud, not silently dropped.
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        Password::defaults(fn () => $this->app->isProduction()
            ? Password::min(10)->letters()->mixedCase()->numbers()->uncompromised()
            : Password::min(8));

        $this->configureRateLimiting();
    }

    private function configureRateLimiting(): void
    {
        // Brute-force protection: per account+IP, and a looser per-IP ceiling against credential stuffing.
        RateLimiter::for('auth-login', fn (Request $request) => [
            Limit::perMinute(5)->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip()),
            Limit::perMinute(30)->by($request->ip()),
        ]);

        RateLimiter::for('auth-register', fn (Request $request) => [
            Limit::perHour(10)->by($request->ip()),
        ]);

        // General API budget per authenticated user (falls back to IP).
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($request->user()?->id ?: $request->ip()));

        // Uploads and search are the expensive endpoints.
        RateLimiter::for('uploads', fn (Request $request) => Limit::perMinute(20)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('search', fn (Request $request) => Limit::perMinute(60)->by($request->user()?->id ?: $request->ip()));
    }
}
