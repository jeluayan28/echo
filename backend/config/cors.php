<?php

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
| The native mobile app does not use CORS (it is not a browser). This matters for the Expo *web* build and
| any future web client. Origins come from CORS_ALLOWED_ORIGINS (comma-separated, no wildcard). The API
| authenticates with bearer tokens, not cookies, so credentials are NOT allowed cross-origin.
|
| Local default: the Expo dev servers. Production: set CORS_ALLOWED_ORIGINS to your real web origin(s), or
| leave it empty to allow no browser origin at all.
*/

$origins = env('CORS_ALLOWED_ORIGINS');
$origins = $origins === null
    ? (env('APP_ENV', 'production') === 'production'
        ? []
        : ['http://localhost:8081', 'http://localhost:19006', 'http://127.0.0.1:8081', 'http://127.0.0.1:19006'])
    : array_values(array_filter(array_map('trim', explode(',', $origins))));

return [
    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => $origins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],

    'exposed_headers' => ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],

    'max_age' => 600,

    'supports_credentials' => false,
];
