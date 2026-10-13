<?php

namespace Tests\Feature\Api;

use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use App\Models\Memory;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class AttachmentApiTest extends ApiTestCase
{
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->user = User::factory()->create();
        $this->as($this->user);
    }

    /** A real (tiny) WAV file: PHP's fileinfo detects it from the bytes, as in production. */
    private function wav(int $extraBytes = 0): string
    {
        $data = str_repeat("\0", 100 + $extraBytes);

        return 'RIFF'.pack('V', 36 + strlen($data)).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 8000, 1, 8).'data'.pack('V', strlen($data)).$data;
    }

    /** An upload whose CLAIMED name/type are whatever we say; PHP sniffs the real type from the content. */
    private function upload(string $content, string $name = 'rec.wav', string $claimedType = 'audio/wav'): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'echo');
        file_put_contents($path, $content);

        return new UploadedFile($path, $name, $claimedType, null, true);
    }

    private function post_upload(UploadedFile $file, array $extra = [], string $url = '/api/v1/attachments')
    {
        return $this->post($url, array_merge(['file' => $file], $extra), ['Accept' => 'application/json']);
    }

    // ── upload ───────────────────────────────────────────────────────────────

    public function test_an_audio_file_can_be_uploaded_before_its_memory_exists(): void
    {
        $response = $this->post_upload($this->upload($this->wav()), ['duration_ms' => 4200])
            ->assertCreated()
            ->assertJsonPath('data.kind', 'audio')
            ->assertJsonPath('data.memory_id', null)
            ->assertJsonPath('data.duration_ms', 4200)
            ->assertJsonStructure(['data' => ['id', 'mime_type', 'size_bytes', 'file_url', 'stream_url', 'created_at']]);

        $attachment = Attachment::findOrFail($response->json('data.id'));
        $this->assertSame($this->user->id, $attachment->user_id);
        Storage::disk('local')->assertExists($attachment->path);
    }

    public function test_storage_internals_and_the_client_filename_never_reach_the_response_or_the_path(): void
    {
        $response = $this->post_upload($this->upload($this->wav(), '../../etc/passwd.wav'))->assertCreated();

        $this->assertArrayNotHasKey('path', $response->json('data'));
        $this->assertArrayNotHasKey('disk', $response->json('data'));
        $this->assertArrayNotHasKey('user_id', $response->json('data'));

        $path = Attachment::first()->path;
        $this->assertMatchesRegularExpression('#^attachments/'.$this->user->id.'/[0-9a-z]{26}\.wav$#', $path);
        $this->assertStringNotContainsString('passwd', $path);
    }

    public function test_the_type_is_checked_from_the_file_content_not_its_name_or_claimed_type(): void
    {
        $this->post_upload($this->upload('<?php echo "pwned"; ?>', 'evil.m4a', 'audio/mp4'))->assertUnprocessable()->assertJsonValidationErrors(['file']);
        $this->post_upload($this->upload('just some text', 'note.mp3', 'audio/mpeg'))->assertUnprocessable()->assertJsonValidationErrors(['file']);
        $this->post_upload($this->upload("\x89PNG\r\n\x1a\n".str_repeat("\0", 64), 'pic.m4a', 'audio/mp4'))->assertUnprocessable();

        $this->assertDatabaseCount('attachments', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_the_size_is_limited(): void
    {
        config(['echo.attachments.max_kb' => 1]);

        $this->post_upload($this->upload($this->wav(extraBytes: 4096)))->assertUnprocessable()->assertJsonValidationErrors(['file']);
        $this->assertDatabaseCount('attachments', 0);
    }

    public function test_a_file_is_required_and_the_duration_is_validated(): void
    {
        $this->postJson('/api/v1/attachments', [])->assertUnprocessable()->assertJsonValidationErrors(['file']);
        $this->postJson('/api/v1/attachments', ['file' => 'not a file'])->assertUnprocessable()->assertJsonValidationErrors(['file']);
        $this->post_upload($this->upload($this->wav()), ['duration_ms' => -5])->assertUnprocessable()->assertJsonValidationErrors(['duration_ms']);
    }

    public function test_uploads_are_rate_limited(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->post_upload($this->upload($this->wav()))->assertCreated();
        }
        $this->post_upload($this->upload($this->wav()))->assertStatus(429);
    }

    public function test_the_disk_is_configurable(): void
    {
        Storage::fake('archive');
        config(['echo.attachments.disk' => 'archive']);

        $this->post_upload($this->upload($this->wav()))->assertCreated();

        $attachment = Attachment::first();
        $this->assertSame('archive', $attachment->disk);
        Storage::disk('archive')->assertExists($attachment->path);
        Storage::disk('local')->assertMissing($attachment->path);
    }

    // ── on a memory ──────────────────────────────────────────────────────────

    public function test_a_recording_can_be_uploaded_straight_onto_a_voice_memo_and_replaces_the_old_one(): void
    {
        $memory = $this->memory($this->user, ['type' => 'voice']);

        $first = $this->post_upload($this->upload($this->wav()), [], "/api/v1/memories/{$memory->id}/attachment")
            ->assertCreated()->assertJsonPath('data.memory_id', $memory->id);
        $oldPath = Attachment::find($first->json('data.id'))->path;

        $second = $this->post_upload($this->upload($this->wav(10)), [], "/api/v1/memories/{$memory->id}/attachment")->assertCreated();

        $this->assertDatabaseCount('attachments', 1);
        Storage::disk('local')->assertMissing($oldPath);
        $this->getJson("/api/v1/memories/{$memory->id}/attachment")->assertOk()->assertJsonPath('data.id', $second->json('data.id'));
    }

    public function test_only_voice_memos_accept_a_recording(): void
    {
        $note = $this->memory($this->user, ['type' => 'note']);

        $this->post_upload($this->upload($this->wav()), [], "/api/v1/memories/{$note->id}/attachment")->assertUnprocessable();
        $this->assertDatabaseCount('attachments', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_a_memory_without_a_recording_has_no_attachment(): void
    {
        $this->getJson('/api/v1/memories/'.$this->memory($this->user)->id.'/attachment')->assertNotFound();
    }

    // ── read / download / delete ─────────────────────────────────────────────

    private function stored(User $owner): Attachment
    {
        Storage::disk('local')->put('attachments/f.wav', $this->wav());

        return Attachment::factory()->create(['user_id' => $owner->id, 'path' => 'attachments/f.wav', 'mime_type' => 'audio/x-wav']);
    }

    public function test_metadata_and_the_authenticated_download(): void
    {
        $a = $this->stored($this->user);

        $this->getJson("/api/v1/attachments/{$a->id}")->assertOk()->assertJsonPath('data.id', $a->id);

        $file = $this->get("/api/v1/attachments/{$a->id}/file", ['Accept' => 'application/json']);
        $file->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringStartsWith('audio/x-wav', $file->headers->get('Content-Type'));
    }

    public function test_the_download_requires_a_token(): void
    {
        $a = $this->stored($this->user);
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/v1/attachments/{$a->id}/file")->assertUnauthorized();
    }

    public function test_the_signed_stream_url_works_without_a_token_until_it_expires_or_is_tampered_with(): void
    {
        $a = $this->stored($this->user);
        $url = $this->getJson("/api/v1/attachments/{$a->id}")->json('data.stream_url');
        $this->assertStringContainsString('signature=', $url);

        $this->app['auth']->forgetGuards();
        $this->get($url)->assertOk();

        // tampering with the id or the signature is rejected
        $this->get(preg_replace('/signature=[0-9a-f]+/', 'signature=deadbeef', $url))->assertForbidden();
        $other = $this->stored(User::factory()->create());
        $this->get(str_replace($a->id, $other->id, $url))->assertForbidden();

        // an expired link is rejected
        $this->travel(AttachmentResourceTtl() + 1)->minutes();
        $this->get($url)->assertForbidden();
    }

    public function test_an_unsigned_stream_request_is_rejected(): void
    {
        $a = $this->stored($this->user);
        $this->app['auth']->forgetGuards();

        $this->get("/api/v1/attachments/{$a->id}/stream")->assertForbidden();
    }

    public function test_a_missing_file_is_a_404_not_a_500(): void
    {
        $a = Attachment::factory()->create(['user_id' => $this->user->id, 'path' => 'attachments/never-existed.wav']);

        $this->get("/api/v1/attachments/{$a->id}/file", ['Accept' => 'application/json'])->assertNotFound();
    }

    public function test_deleting_an_attachment_removes_the_row_and_the_file(): void
    {
        $a = $this->stored($this->user);

        $this->deleteJson("/api/v1/attachments/{$a->id}")->assertNoContent();

        $this->assertDatabaseMissing('attachments', ['id' => $a->id]);
        Storage::disk('local')->assertMissing('attachments/f.wav');
    }

    // ── prune command ────────────────────────────────────────────────────────

    public function test_prune_removes_old_unclaimed_uploads_and_expired_trash_but_nothing_else(): void
    {
        $fresh = $this->stored($this->user); // unclaimed, but recent
        Storage::disk('local')->put('attachments/old-orphan.wav', 'x');
        $orphan = Attachment::factory()->create(['user_id' => $this->user->id, 'path' => 'attachments/old-orphan.wav', 'created_at' => now()->subHours(25)]);

        $kept = $this->memory($this->user);
        $recentlyTrashed = $this->memory($this->user);
        $recentlyTrashed->delete();
        Storage::disk('local')->put('attachments/trash.wav', 'x');
        $expired = $this->memory($this->user, ['type' => 'voice']);
        Attachment::factory()->create(['user_id' => $this->user->id, 'memory_id' => $expired->id, 'path' => 'attachments/trash.wav']);
        $expired->delete();
        \DB::table('memories')->where('id', $expired->id)->update(['deleted_at' => now()->subDays(31)]);

        $this->artisan('echo:prune --dry-run')->assertSuccessful();
        $this->assertDatabaseHas('attachments', ['id' => $orphan->id]); // dry run changes nothing

        $this->artisan('echo:prune')->expectsOutputToContain('Orphaned uploads: 1. Trashed memories purged: 1.')->assertSuccessful();

        $this->assertDatabaseMissing('attachments', ['id' => $orphan->id]);
        Storage::disk('local')->assertMissing('attachments/old-orphan.wav');
        $this->assertNull(Memory::withTrashed()->find($expired->id));
        Storage::disk('local')->assertMissing('attachments/trash.wav');

        $this->assertDatabaseHas('attachments', ['id' => $fresh->id]);
        $this->assertNotNull(Memory::find($kept->id));
        $this->assertNotNull(Memory::onlyTrashed()->find($recentlyTrashed->id));
    }
}

function AttachmentResourceTtl(): int
{
    return AttachmentResource::STREAM_URL_MINUTES;
}
