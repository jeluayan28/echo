<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // RefreshDatabase wipes the database. Never let that happen to a real one.
        $database = DB::connection()->getDatabaseName();
        if (! str_ends_with((string) $database, '_test')) {
            $this->fail("Refusing to run tests against \"{$database}\": the test database name must end in \"_test\".");
        }
    }
}
