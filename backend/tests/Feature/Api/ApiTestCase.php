<?php

namespace Tests\Feature\Api;

use App\Models\Memory;
use App\Models\MemoryLink;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

abstract class ApiTestCase extends TestCase
{
    use RefreshDatabase;

    /** Authenticates subsequent requests as $user (call again to switch user). */
    protected function as(User $user): static
    {
        Sanctum::actingAs($user, ['*']);

        return $this;
    }

    protected function memory(User $user, array $attrs = []): Memory
    {
        return Memory::factory()->forUser($user)->create($attrs);
    }

    protected function link(User $user, Memory $a, Memory $b): MemoryLink
    {
        [$from, $to] = MemoryLink::canonical($a->id, $b->id);

        return MemoryLink::create(['user_id' => $user->id, 'from_memory_id' => $from, 'to_memory_id' => $to]);
    }

    /** Number of SQL queries a callback runs. */
    protected function queryCount(callable $callback): int
    {
        \DB::flushQueryLog();
        \DB::enableQueryLog();
        $callback();
        $count = count(\DB::getQueryLog());
        \DB::disableQueryLog();

        return $count;
    }
}
