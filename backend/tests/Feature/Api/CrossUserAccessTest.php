<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Collection;
use App\Models\Memory;
use App\Models\MemoryReminder;
use App\Models\Tag;
use App\Models\User;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * Privacy: Bob must not be able to read, change, link to, or even confirm the existence of Alice's data —
 * through any route, including nested ones. Every failure must be an indistinguishable 404 (or a validation
 * error that doesn't reveal the id exists), and Alice's data must be byte-for-byte unchanged afterwards.
 */
class CrossUserAccessTest extends ApiTestCase
{
    private User $alice;

    private User $bob;

    private Memory $memory;

    private Memory $second;

    private Memory $voice;

    private Collection $collection;

    private Tag $tag;

    private Attachment $attachment;

    private MemoryReminder $reminder;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');

        $this->alice = User::factory()->create();
        $this->bob = User::factory()->create();

        $this->collection = $this->alice->collections()->create(['name' => 'Alice private']);
        $this->memory = $this->memory($this->alice, ['title' => 'Alice secret', 'body' => 'private words', 'collection_id' => $this->collection->id]);
        $this->second = $this->memory($this->alice, ['title' => 'Alice second']);
        $this->voice = $this->memory($this->alice, ['type' => 'voice']);
        $this->tag = $this->alice->tags()->create(['name' => 'secret']);
        $this->memory->tags()->attach($this->tag, ['user_id' => $this->alice->id]);
        $this->link($this->alice, $this->memory, $this->second);
        $this->reminder = MemoryReminder::factory()->create(['memory_id' => $this->memory->id]);
        Storage::disk('local')->put('attachments/alice.m4a', 'alice audio');
        $this->attachment = Attachment::factory()->create(['user_id' => $this->alice->id, 'memory_id' => $this->voice->id, 'path' => 'attachments/alice.m4a']);

        $this->as($this->bob);
    }

    /** @return array<string, array{0: string, 1: string, 2?: array}> */
    public static function foreignResourceRequests(): array
    {
        return [
            'show memory' => ['GET', '/memories/{memory}'],
            'update memory' => ['PATCH', '/memories/{memory}', ['title' => 'hacked']],
            'delete memory' => ['DELETE', '/memories/{memory}'],
            'open memory' => ['POST', '/memories/{memory}/open'],
            'restore memory' => ['POST', '/memories/{memory}/restore'],
            'force delete memory' => ['DELETE', '/memories/{memory}/force'],
            'memory links' => ['GET', '/memories/{memory}/links'],
            'link FROM their memory' => ['POST', '/memories/{memory}/links', ['memory_id' => '{bobs}']],
            'unlink' => ['DELETE', '/memories/{memory}/links/{second}'],
            'read reminder' => ['GET', '/memories/{memory}/reminder'],
            'set reminder' => ['PUT', '/memories/{memory}/reminder', ['remind_at' => '+1 day']],
            'delete reminder' => ['DELETE', '/memories/{memory}/reminder'],
            'complete reminder' => ['POST', '/reminders/{reminder}/complete'],
            'memory attachment' => ['GET', '/memories/{voice}/attachment'],
            'attachment metadata' => ['GET', '/attachments/{attachment}'],
            'attachment download' => ['GET', '/attachments/{attachment}/file'],
            'delete attachment' => ['DELETE', '/attachments/{attachment}'],
            'show collection' => ['GET', '/collections/{collection}'],
            'update collection' => ['PATCH', '/collections/{collection}', ['name' => 'hacked']],
            'delete collection' => ['DELETE', '/collections/{collection}'],
            'update tag' => ['PATCH', '/tags/{tag}', ['name' => 'hacked']],
            'delete tag' => ['DELETE', '/tags/{tag}'],
        ];
    }

    #[DataProvider('foreignResourceRequests')]
    public function test_another_users_resources_are_invisible_and_untouchable(string $method, string $uri, array $payload = []): void
    {
        $bobs = $this->memory($this->bob, ['title' => 'Bob own']);
        $replace = [
            '{memory}' => $this->memory->id, '{second}' => $this->second->id, '{voice}' => $this->voice->id,
            '{collection}' => $this->collection->id, '{tag}' => $this->tag->id,
            '{attachment}' => $this->attachment->id, '{reminder}' => $this->reminder->id, '{bobs}' => $bobs->id,
        ];
        $url = '/api/v1'.strtr($uri, $replace);
        $payload = array_map(fn ($v) => is_string($v) && isset($replace[$v]) ? $replace[$v] : ($v === '+1 day' ? now()->addDay()->toIso8601String() : $v), $payload);

        $before = $this->snapshot();

        $response = $this->json($method, $url, $payload);

        $response->assertNotFound();
        $this->assertSame(['message' => 'Resource not found.'], $response->json());
        $this->assertSame($before, $this->snapshot(), "{$method} {$uri} changed Alice's data");
    }

    public function test_the_failure_for_someone_elses_id_is_identical_to_the_failure_for_an_id_that_does_not_exist(): void
    {
        $theirs = $this->getJson("/api/v1/memories/{$this->memory->id}");
        $missing = $this->getJson('/api/v1/memories/01ARZ3NDEKTSV4RRFFQ69G5FAV');

        $this->assertSame($missing->status(), $theirs->status());
        $this->assertSame($missing->json(), $theirs->json());
    }

    public function test_bob_cannot_link_his_memory_to_alices(): void
    {
        $bobs = $this->memory($this->bob);

        $this->postJson("/api/v1/memories/{$bobs->id}/links", ['memory_id' => $this->memory->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['memory_id']);
        $this->assertDatabaseCount('memory_links', 1); // only Alice's own
    }

    public function test_bob_cannot_file_a_memory_into_alices_collection_or_claim_her_upload(): void
    {
        $this->postJson('/api/v1/memories', ['type' => 'note', 'title' => 'x', 'collection_id' => $this->collection->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['collection_id']);

        $upload = Attachment::factory()->create(['user_id' => $this->alice->id]); // alice's unclaimed upload
        $this->postJson('/api/v1/memories', ['type' => 'voice', 'title' => 'x', 'attachment_id' => $upload->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['attachment_id']);
        $this->assertNull($upload->fresh()->memory_id);
    }

    public function test_alices_data_never_appears_in_bobs_lists(): void
    {
        foreach (['memories', 'memories/trashed', 'collections', 'tags', 'links', 'reminders', 'search?q=secret'] as $path) {
            $this->getJson("/api/v1/{$path}")->assertOk()->assertJsonCount(0, 'data');
        }
        $this->getJson('/api/v1/tags?include_unused=1')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/memories?tag=secret')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/memories?collection_id='.$this->collection->id)->assertJsonCount(0, 'data');
    }

    public function test_a_signed_stream_url_for_alices_file_is_only_ever_issued_to_alice(): void
    {
        $this->getJson("/api/v1/attachments/{$this->attachment->id}")->assertNotFound(); // Bob can't obtain the URL

        $this->as($this->alice);
        $url = $this->getJson("/api/v1/attachments/{$this->attachment->id}")->assertOk()->json('data.stream_url');
        $this->assertStringContainsString('/stream', $url);
    }

    public function test_a_profile_update_cannot_touch_another_account(): void
    {
        $this->patchJson('/api/v1/me', ['name' => 'Bob renamed', 'id' => $this->alice->id, 'email' => $this->alice->email])->assertUnprocessable();
        $this->patchJson('/api/v1/me', ['name' => 'Bob renamed', 'id' => $this->alice->id])->assertOk();

        $this->assertSame('Bob renamed', $this->bob->fresh()->name);
        $this->assertNotSame('Bob renamed', $this->alice->fresh()->name);
    }

    public function test_every_authenticated_route_rejects_anonymous_callers(): void
    {
        $this->app['auth']->forgetGuards();
        $public = ['v1.auth.register', 'v1.auth.login', 'v1.attachments.stream']; // stream is signed, tested elsewhere

        $checked = 0;
        foreach (Route::getRoutes() as $route) {
            $name = $route->getName();
            if (! $name || ! str_starts_with($name, 'v1.') || in_array($name, $public, true)) {
                continue;
            }
            $uri = '/'.preg_replace('/\{[^}]+\}/', '01ARZ3NDEKTSV4RRFFQ69G5FAV', $route->uri());
            $method = $route->methods()[0];

            $this->json($method, $uri)->assertUnauthorized();
            $checked++;
        }

        $this->assertGreaterThan(30, $checked, 'the route scan should have covered the whole API');
    }

    public function test_every_v1_route_is_either_public_or_behind_sanctum(): void
    {
        foreach (Route::getRoutes() as $route) {
            $name = (string) $route->getName();
            if (! str_starts_with($name, 'v1.') || in_array($name, ['v1.auth.register', 'v1.auth.login', 'v1.attachments.stream'], true)) {
                continue;
            }
            $this->assertContains('auth:sanctum', $route->gatherMiddleware(), "{$name} is not protected");
        }
    }

    /** A fingerprint of everything Alice owns. */
    private function snapshot(): array
    {
        return [
            'memories' => Memory::withTrashed()->where('user_id', $this->alice->id)->orderBy('id')->get()->map->getAttributes()->all(),
            'collections' => Collection::where('user_id', $this->alice->id)->orderBy('id')->get()->map->getAttributes()->all(),
            'tags' => Tag::where('user_id', $this->alice->id)->orderBy('id')->get()->map->getAttributes()->all(),
            'links' => \DB::table('memory_links')->where('user_id', $this->alice->id)->orderBy('id')->get()->map(fn ($r) => (array) $r)->all(),
            'pivot' => \DB::table('memory_tag')->where('user_id', $this->alice->id)->get()->map(fn ($r) => (array) $r)->all(),
            'reminders' => MemoryReminder::where('user_id', $this->alice->id)->orderBy('id')->get()->map->getAttributes()->all(),
            'attachments' => Attachment::where('user_id', $this->alice->id)->orderBy('id')->get()->map->getAttributes()->all(),
            'files' => Storage::disk('local')->allFiles(),
        ];
    }
}
