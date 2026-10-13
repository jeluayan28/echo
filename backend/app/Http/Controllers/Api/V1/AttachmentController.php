<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use App\Models\Memory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Voice recordings. The bytes go to the configured filesystem disk (config/echo.php → ECHO_ATTACHMENT_DISK, a
 * PRIVATE disk); PostgreSQL only stores metadata. File names are generated server-side, so a client can never
 * choose a path or an extension.
 *
 * Two upload paths:
 *  - POST /attachments              upload first (as the mobile app does), then pass `attachment_id` when saving the memory.
 *  - POST /memories/{id}/attachment upload directly onto an existing voice memory (replaces its recording).
 */
class AttachmentController extends Controller
{
    /** Upload without a memory yet. Unclaimed uploads are cleaned up by `php artisan echo:prune`. */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validateUpload($request);
        $attachment = $this->persist($request, $request->file('file'), $data['duration_ms'] ?? null, memoryId: null);

        return (new AttachmentResource($attachment))->response()->setStatusCode(201);
    }

    public function storeForMemory(Request $request, Memory $memory): JsonResponse
    {
        $this->authorize('update', $memory);
        abort_unless($memory->type->value === 'voice', 422, 'Only voice memories can have a recording.');

        $data = $this->validateUpload($request);

        $old = Attachment::query()->where('memory_id', $memory->id)->first();
        $new = DB::transaction(function () use ($request, $memory, $old, $data) {
            $old?->delete(); // frees the one-recording-per-memory slot

            return $this->persist($request, $request->file('file'), $data['duration_ms'] ?? null, $memory->id);
        });
        $old?->deleteStoredFile(); // only after the new one is safely stored and recorded

        return (new AttachmentResource($new))->response()->setStatusCode(201);
    }

    public function show(Attachment $attachment): AttachmentResource
    {
        $this->authorize('view', $attachment);

        return new AttachmentResource($attachment);
    }

    public function forMemory(Memory $memory): AttachmentResource
    {
        $this->authorize('view', $memory);

        $attachment = Attachment::query()->where('memory_id', $memory->id)->first();
        abort_if($attachment === null, 404);
        $this->authorize('view', $attachment);

        return new AttachmentResource($attachment);
    }

    /** Authenticated download (bearer token). */
    public function file(Attachment $attachment): StreamedResponse
    {
        $this->authorize('view', $attachment);

        return $this->respondWithFile($attachment);
    }

    /**
     * Playback URL for audio players that cannot send headers. Reachable only with a valid, unexpired signature
     * that this API issued to the owner (see AttachmentResource), so no bearer token is needed here.
     */
    public function stream(Attachment $attachment): StreamedResponse
    {
        return $this->respondWithFile($attachment);
    }

    public function destroy(Attachment $attachment): JsonResponse
    {
        $this->authorize('delete', $attachment);

        $attachment->delete();
        $attachment->deleteStoredFile();

        return response()->json(null, 204);
    }

    // ── internals ────────────────────────────────────────────────────────────

    private function validateUpload(Request $request): array
    {
        $allowed = array_keys(config('echo.attachments.mime_types'));

        return $request->validate([
            // `mimetypes` checks the type PHP detects from the file's CONTENT, not the name or the client's header.
            'file' => ['required', 'file', 'max:'.config('echo.attachments.max_kb'), 'mimetypes:'.implode(',', $allowed)],
            'duration_ms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:21600000'],
        ]);
    }

    private function persist(Request $request, UploadedFile $file, ?int $durationMs, ?string $memoryId): Attachment
    {
        $mime = (string) $file->getMimeType();
        $extension = config('echo.attachments.mime_types')[$mime] ?? 'bin';
        $disk = config('echo.attachments.disk');
        $userId = $request->user()->id;

        // Server-chosen name: nothing from the client reaches the path.
        $path = Storage::disk($disk)->putFileAs("attachments/{$userId}", $file, Str::lower((string) Str::ulid()).'.'.$extension);
        abort_if($path === false, 500, 'The file could not be stored.');

        try {
            return Attachment::query()->create([
                'user_id' => $userId,
                'memory_id' => $memoryId,
                'kind' => 'audio',
                'disk' => $disk,
                'path' => $path,
                'mime_type' => $mime,
                'size_bytes' => $file->getSize(),
                'duration_ms' => $durationMs,
            ]);
        } catch (\Throwable $e) {
            Storage::disk($disk)->delete($path); // never leave a file without a record
            throw $e;
        }
    }

    private function respondWithFile(Attachment $attachment): StreamedResponse
    {
        $disk = Storage::disk($attachment->disk);
        abort_unless($disk->exists($attachment->path), 404);

        return $disk->response($attachment->path, null, [
            'Content-Type' => $attachment->mime_type,
            'Content-Disposition' => 'inline',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
