<?php

use Illuminate\Support\Facades\Schedule;

// Housekeeping. Requires the scheduler: `php artisan schedule:work` locally, or a cron entry running
// `php artisan schedule:run` every minute in production.
Schedule::command('echo:prune')->dailyAt('03:15')->onOneServer()->withoutOverlapping();

// Keeps the personal-access-token table from growing forever.
Schedule::command('sanctum:prune-expired --hours=24')->daily();
