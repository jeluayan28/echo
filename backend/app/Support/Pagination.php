<?php

namespace App\Support;

use Illuminate\Http\Request;

final class Pagination
{
    /** `?per_page=` clamped to 1..max, so a client can't ask for a million rows. */
    public static function perPage(Request $request, ?int $max = null): int
    {
        $max ??= (int) config('echo.pagination.max');

        return max(1, min((int) $request->integer('per_page', (int) config('echo.pagination.default')), $max));
    }
}
