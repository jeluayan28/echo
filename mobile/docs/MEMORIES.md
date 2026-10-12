# Memory management

## Model (`src/data/types.ts`, mirrored by `backend/database/migrations/2026_10_12_2*`)

| Field | Notes |
|---|---|
| `id` | Unique. ULID on the server (not enumerable); generated client-side in the sample repository |
| `type` | `note` · `idea` · `link` · `voice` |
| `title` | Required, ≤ 120 chars |
| `body` | Content / description / notes, ≤ 10,000 chars, may be empty |
| `tags` | Normalized (lowercase, trimmed, unique, no `#`), ≤ 10 tags of ≤ 30 chars. Empty is valid |
| `collectionId` | Optional; a memory is in at most one collection |
| `sourceUrl` | Required for `link`; optional "source" on note/idea. http(s) only |
| `attachment` | Metadata only (`kind`, `uri`/storage key, `mimeType`, `sizeBytes`, `durationMs`). Required for `voice` |
| `favorite`, `pinned` | Booleans |
| `createdAt`, `updatedAt` | `updatedAt` changes on content/collection edits, **not** on favorite/pin |
| `lastOpenedAt` | Powers "Continue exploring"; never changes `updatedAt` |

**Files never go in PostgreSQL.** The `attachments` table stores `disk`, `path`, `mime_type`,
`size_bytes`, `duration_ms` — the bytes live on a filesystem disk (local in development,
S3-compatible object storage in production). A backend test fails if a blob/bytea column is added.

Server-only additions, each justified: `deleted_at` (soft delete → real Undo), `user_id` on
memories/collections/tags (ownership), `memory_links` (Neural Map edges), `tags` + `memory_tag` pivot.

## Flows

1. **Capture:** Quick Capture (Note/Idea/Link/Voice) or the center tab button → `/memory/new?type=…`
   (`&collectionId=` when started from inside a collection).
2. **Fill in:** type selector, title, optional source link, content, tags (comma/Enter to add, suggestions
   from existing tags), collection picker, favorite/pin.
3. **Save:** validation (`data/validation.ts`) → two-phase save in `features/memory/save-memory.ts`:
   *upload recording* then *write record*. The record is never written unless the upload succeeded.
4. **Result:** detail screen; the memory is in the dashboard (Continue exploring, counts) and the Vault.
5. **Reopen / edit / delete:** detail → Edit (type is locked) or Delete (confirm → **Undo** for 6 s).

## Guarantees

- **No silent data loss:** leaving a form with changes (header ✕, Android back button, iOS swipe) asks to discard.
  Text still typed in the tag field counts as a change and is saved with the memory.
  *Limitation:* the browser's own Back button on web cannot be intercepted; this app targets phones.
- **Failed saves keep your work:** a failed upload shows "Upload didn't finish — Retry upload"; a failed record
  write shows "Not saved — Try again". All fields and the recording stay in the form. A retry after a
  successful upload does not upload twice. Uploads show progress and can be cancelled.
- **Delete is reversible because a restore exists:** the repository soft-deletes (memory + its links go to a
  trash), "Undo" restores them (links whose other end still exists; uncollected if its collection was deleted),
  and after the window the entry is purged and its audio file deleted. Deleting a *collection* never deletes
  memories.
- **Microphone:** permission denied → message and "Record" can be tried again; permanently blocked →
  message plus an "Open Settings" button. Live duration while recording, 5-minute cap, recordings that end on
  their own (e.g. an incoming call) are saved, playback with play/pause, tap-to-seek and elapsed/total time.

## Persistence — what is and isn't saved

**Nothing survives an app restart yet.** Memories live in an in-memory store behind the repository
(`src/data/store.ts`). Voice files are written to the device's document directory and are *orphaned* on restart,
because the records that reference them are gone. Real persistence arrives with the Laravel API
(Postgres for records, a filesystem/object-storage disk for audio). Until then, don't treat the app as
durable storage.

## Tests

- `npm test` (jest-expo): `src/data/__tests__` — validation rules, selectors (search/filter/rediscovery rule),
  and memory operations through the repository: create, edit, favorite/pin vs. edit timestamps, collections,
  links, soft delete → undo → purge, upload progress/cancel/interruption, and save-phase failure/retry.
  (Sensitive tests were mutation-checked: breaking the rule makes them fail.)
- `php artisan test` in `backend/`: schema, relations, soft delete/restore, collection deletion, no binary
  columns. Runs on in-memory SQLite (not yet on PostgreSQL).
- UI flows were exercised in a browser against the web build at 320×568 and 430×932; native-only behavior
  (hardware back, swipe gesture, real microphone prompts, keyboard) has not been run on a device.
