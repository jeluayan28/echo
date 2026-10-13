<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationPreferenceResource;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    public function show(Request $request): NotificationPreferenceResource
    {
        return new NotificationPreferenceResource($this->preference($request));
    }

    public function update(Request $request): NotificationPreferenceResource
    {
        $data = $request->validate([
            'reminders_enabled' => ['sometimes', 'boolean'],
            'timezone' => ['sometimes', 'string', 'timezone:all'],
            'quiet_hours_start' => ['nullable', 'date_format:H:i', 'required_with:quiet_hours_end'],
            'quiet_hours_end' => ['nullable', 'date_format:H:i', 'required_with:quiet_hours_start'],
        ]);

        $preference = $this->preference($request);
        $preference->update($data);

        return new NotificationPreferenceResource($preference);
    }

    /** Created on first use with defaults; scoped to the authenticated user, never to a client-supplied id. */
    private function preference(Request $request)
    {
        return $request->user()->notificationPreference()->firstOrCreate([], [
            'reminders_enabled' => true,
            'timezone' => 'UTC',
        ])->fresh(); // fresh(): a just-created row must not make the resource answer 201
    }
}
