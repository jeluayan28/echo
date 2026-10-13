<?php

use App\Http\Middleware\ForceJsonResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [ForceJsonResponse::class]);

        // The API is bearer-token only: no cookies, no CSRF, no sessions on /api.
        // Behind a load balancer, set TRUSTED_PROXIES so rate limiting sees the real client IP.
        $middleware->trustProxies(at: env('TRUSTED_PROXIES') ? array_map('trim', explode(',', env('TRUSTED_PROXIES'))) : null);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Every /api response is JSON, even for errors raised before routing (404, 405, 401...).
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        $json = fn (string $message, int $status) => response()->json(['message' => $message], $status);

        $exceptions->render(fn (AuthenticationException $e, Request $r) => $r->is('api/*') ? $json('Unauthenticated.', 401) : null);

        // Someone else's resource and a resource that does not exist must look IDENTICAL, byte for byte, so ids
        // can't be probed. Policies deny with a 404 (Response::denyAsNotFound); a route-model-binding miss is a
        // ModelNotFoundException; an unknown URL is a 404 HttpException. All of them end up with the same body.
        $notFound = fn (Request $r) => $r->is('api/*') ? $json('Resource not found.', 404) : null;
        $exceptions->render(fn (ModelNotFoundException $e, Request $r) => $notFound($r));
        $exceptions->render(fn (AuthorizationException $e, Request $r) => $notFound($r));
        $exceptions->render(fn (HttpExceptionInterface $e, Request $r) => $e->getStatusCode() === 404 || $e instanceof AccessDeniedHttpException
            ? $notFound($r)
            : null);
    })->create();
