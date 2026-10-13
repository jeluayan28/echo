<?php

namespace Database\Seeders;

use App\Models\MemoryLink;
use App\Models\User;
use App\Services\TagSync;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Repeatable DEVELOPMENT data (mirrors the mobile app's sample data). Refuses to run in production.
 *
 * The demo account's password is NEVER stored in source: set DEMO_USER_PASSWORD in your .env, or one is
 * generated and printed once. Running it again resets that account's data rather than duplicating it.
 */
class DatabaseSeeder extends Seeder
{
    public function run(TagSync $tags): void
    {
        if (app()->isProduction()) {
            $this->command?->error('Refusing to seed demo data in production.');

            return;
        }

        $password = env('DEMO_USER_PASSWORD') ?: Str::password(16, symbols: false);
        $email = env('DEMO_USER_EMAIL', 'demo@echo.test');

        User::query()->where('email', $email)->delete(); // cascades: repeatable
        $user = User::query()->create(['name' => 'Demo', 'email' => $email, 'password' => $password]);

        $c = collect(['Product ideas' => 'Things worth building', 'Reading list' => 'Articles and papers', 'Life admin' => null])
            ->map(fn ($desc, $name) => $user->collections()->create(['name' => $name, 'description' => $desc]));

        $make = function (string $type, string $title, string $body, array $tagNames, ?string $collection, array $extra = []) use ($user, $c, $tags) {
            $memory = $user->memories()->create(array_merge([
                'type' => $type, 'title' => $title, 'body' => $body, 'collection_id' => $collection ? $c[$collection]->id : null,
            ], $extra));
            $tags->sync($memory, $tagNames);

            return $memory;
        };

        $m1 = $make('idea', 'Resurface forgotten notes each morning', 'A second brain should bring back old thoughts, weighted by how connected they are to what I wrote recently.', ['product', 'rediscovery'], 'Product ideas', ['favorite' => true, 'pinned' => true]);
        $m2 = $make('link', 'How hippocampal replay consolidates memory', 'Good overview of why spaced resurfacing helps retention.', ['neuroscience', 'rediscovery'], 'Reading list', ['source_url' => 'https://example.com/hippocampal-replay']);
        $m3 = $make('note', 'Meeting notes: onboarding flow', 'Keep sign-up to two screens. Ask for the first memory before asking for notification permission.', ['product', 'ux'], 'Product ideas', ['pinned' => true]);
        $m4 = $make('idea', 'Neural Map should cluster by tag', 'Nodes that share tags drift closer together; manual links draw cyan edges.', ['product', 'map'], 'Product ideas', ['favorite' => true]);
        $make('note', 'Renew passport', 'Appointment needs to be booked at least six weeks before travel.', ['admin'], 'Life admin');
        $make('link', 'Local-first software', 'Why apps should keep working offline and sync later.', ['engineering', 'reading'], 'Reading list', ['source_url' => 'https://example.com/local-first']);

        foreach ([[$m4, $m1], [$m3, $m4], [$m2, $m1]] as [$a, $b]) {
            [$from, $to] = MemoryLink::canonical($a->id, $b->id);
            MemoryLink::query()->create(['user_id' => $user->id, 'from_memory_id' => $from, 'to_memory_id' => $to]);
        }

        $this->command?->info("Demo account: {$email}");
        if (! env('DEMO_USER_PASSWORD')) {
            $this->command?->warn("Generated password (shown once, set DEMO_USER_PASSWORD to choose your own): {$password}");
        }
    }
}
