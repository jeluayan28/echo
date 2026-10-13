<?php

namespace App\Http\Resources;

use App\Models\NotificationPreference;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin NotificationPreference */
class NotificationPreferenceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'reminders_enabled' => $this->reminders_enabled,
            'timezone' => $this->timezone,
            'quiet_hours_start' => $this->quiet_hours_start ? substr((string) $this->quiet_hours_start, 0, 5) : null,
            'quiet_hours_end' => $this->quiet_hours_end ? substr((string) $this->quiet_hours_end, 0, 5) : null,
        ];
    }
}
