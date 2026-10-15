<?php

use Illuminate\Support\Facades\Schedule;

// Housekeeping. Requires the scheduler: `php artisan schedule:work` locally, or a cron entry running
// `php artisan schedule:run` every minute in production.
Schedule::command('echo:prune')->dailyAt('03:15')->onOneServer()->withoutOverlapping();

// Optional semantic search: catches memories whose embedding was missed (outage, model change). A no-op when the
// feature is not configured.
Schedule::command('echo:embed-backfill')->dailyAt('03:45')->onOneServer()->withoutOverlapping();

// Keeps the personal-access-token table from growing forever.
Schedule::command('sanctum:prune-expired --hours=24')->daily();
