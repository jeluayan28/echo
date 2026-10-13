<?php

namespace App\Http\Resources;

use App\Models\Attachment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;

/**
 * Attachment METADATA. Storage internals (disk, path) are never exposed. `stream_url` is a short-lived
 * signed URL so an audio player that cannot send an Authorization header can still play the file; it is only
 * ever issued here, to the owner, and expires quickly. `file_url` needs the bearer token.
 *
 * @mixin Attachment
 */
class AttachmentResource extends JsonResource
{
    public const STREAM_URL_MINUTES = 10;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'memory_id' => $this->memory_id,
            'kind' => $this->kind,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'duration_ms' => $this->duration_ms,
            'file_url' => route('v1.attachments.file', $this->id),
            'stream_url' => URL::temporarySignedRoute('v1.attachments.stream', now()->addMinutes(self::STREAM_URL_MINUTES), ['attachment' => $this->id]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
