<?php

namespace App\Services;

use App\Models\Memory;
use RuntimeException;

/** An edit was based on an older version of the memory than the one stored. Nothing was written. */
class MemoryConflict extends RuntimeException
{
    public function __construct(public readonly Memory $current)
    {
        parent::__construct('This memory was changed somewhere else since you opened it.');
    }
}
