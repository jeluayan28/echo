# Offline reading, conflicts and local data protection

Status: rules written before the code. The code in `src/data/offline-cache.ts`, `src/data/connectivity.ts`,
`src/data/sync.ts` and the backend precondition in `MemoryWriter` implement exactly this.

## 1. What offline means in ECHO

**Offline is read-only.** With no connection you can open the app and read the memories, collections, tags,
links and reminders that were saved on this device at the last successful sync. You cannot create, edit, delete,
link, upload or search by meaning. Those actions fail with a clear message and keep whatever you typed.

Why no offline editing yet: an edit queue needs the conflict rules below to be right *and* a way to show the user
a merge. We chose to ship the rules and the server-side protection first (section 3), and to make
"queue edits while offline" a later feature that must follow section 2 unchanged.

What is not available offline: voice playback (the signed audio link is a short-lived credential and is never
saved), search by meaning, Neural Map data that was never loaded (the map only uses what is cached), and the full
text of memories that were never opened (list rows carry a 200-character excerpt; the detail screen says so).

## 2. Conflict resolution rules

These rules apply to any write, now and to any future offline queue.

1. **The server is the source of truth.** The device copy is a convenience. When the two disagree after a
   reconnect, the server's data is what the app shows.
2. **A cached copy is never written back over the server.** Reconnecting only *reads*: it replaces the device
   copy with the server's data. Nothing on the device is uploaded automatically.
3. **Every content edit carries the version it was based on** (`base_updated_at`, the `updated_at` the editor
   opened with). If the server's `updated_at` for that memory is different, the server answers **409 conflict**
   with its current copy and changes nothing.
4. **The user decides, never the app.** On a conflict the editor keeps the user's text and offers:
   - *Keep my version*: send it again based on the server's newer version. This is an explicit overwrite and is
     only possible after the user has been told someone/something else changed the memory.
   - *Use the latest*: discard the draft and load the server's version.
   - *Cancel*: stay in the editor; nothing is sent.
5. **Organizing toggles are field-level, last write wins**: favorite and pin do not change `updated_at`, do not
   carry a base version, and cannot conflict with a content edit (they touch different data).
6. **Deleted on the server wins over an edit.** Saving an edit to a memory that no longer exists reports that the
   memory was deleted; it is never silently recreated.
7. **Creates are never retried automatically**, so a flaky connection cannot create duplicates. (Unchanged.)
8. **A device copy is dropped, not merged**, when it cannot be trusted: wrong account, unreadable file, unknown
   format version, or too large. The app then behaves as if there were no copy.
9. **An expired or revoked session erases the device copy.** The cached data stays readable only while the
   server has not told us the session is over (see section 4).

Future offline queue (not built): each queued edit stores its `base_updated_at`; on reconnect each is sent
one by one; a 409 puts that edit in a "needs your decision" list using the same three choices as rule 4;
queued edits are removed on sign-out like the rest of the device copy.

## 3. How reconnecting works

1. A request that cannot reach the server marks the app *offline* (banner shown). Any server response marks it
   *online* again. HTTP errors such as 500 or 401 are not "offline".
2. While offline the app retries a quiet refresh every 20 seconds, and also whenever you pull to refresh or
   return to a tab.
3. A successful refresh replaces the device copy as one all-or-nothing step. A refresh that fails halfway leaves
   the previous copy untouched.
4. If the refresh returns 401 the session has ended: the device copy is erased and you are sent to sign-in.

## 4. What is stored on the device, and what protects it

| Item | Where | Notes |
| --- | --- | --- |
| Login token | iOS Keychain / Android Keystore via `expo-secure-store` (`…AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) | Never in the offline copy, never in AsyncStorage, never logged. |
| Offline copy (memories, collections, links, tags, reminders, name and email) | One JSON file `echo-offline-v1.json` in the app's **cache** directory | The cache directory is skipped by iCloud/iTunes and Android auto-backup by default (platform behaviour, **not yet checked on a device**). The OS may delete it when space is low; the app then just loads from the server. |
| "Keep an offline copy" preference | `expo-secure-store` | Small, not secret; stored there so an OS cache clean-up cannot silently switch it back on. |
| Voice file links | Not stored | Signed URLs are credentials. |
| Web build | **Nothing persisted** | No secure store exists in browsers, so the web build keeps no offline copy at all. |

Controls:

- **Settings → Privacy → Keep an offline copy** (on by default on phones). Turning it off deletes the copy at once.
- **Settings → Privacy → Clear offline copy** deletes the file now and keeps you signed in.
- **Sign out, session expiry, signing in as a different account, and account deletion** delete the copy.
- A copy that belongs to another account (email mismatch) is deleted, not shown.

### Limits — please read

- **The offline copy is not encrypted by ECHO.** It is plain JSON protected only by what the operating system
  provides: the app sandbox (other apps cannot read it) and device encryption / screen lock. On a rooted or
  jailbroken phone, with a debugger attached, or in an unencrypted device backup made by the owner's own tools
  or forensic tooling, it can be read. Anyone who can unlock the phone and open ECHO can read it anyway.
- **ECHO does not have end-to-end encryption.** The server can read your memories (it needs to, to search and to
  embed them for search by meaning). Traffic uses HTTPS in staging/production builds. Do not describe ECHO as
  end-to-end encrypted.
- Deleting the file is a normal file delete. Flash storage may keep remnants until overwritten; ECHO does not
  perform secure erase.
- The in-memory copy is visible to the running app and appears in OS task-switcher screenshots like any screen.
- The cache directory can be cleared by the user from the OS app settings ("Clear cache"); that is safe.
- An offline copy can be stale. The banner says when it was last updated.
- Offline, an expired session is only noticed when the app next reaches the server. The token's own expiry time is
  checked on launch even offline.
- Encrypting the copy with a key held in the Keychain/Keystore is possible later (it needs a native crypto
  module, which is not installed) and would still not protect against a compromised device.

## 5. Test map

| Scenario | Where |
| --- | --- |
| Cache round trip, no tokens/signed links, wrong account, corrupt/old/oversized file, clear, preference | `src/data/__tests__/offline-cache.test.ts` |
| Offline start shows cached data, banner state, reconnect replaces it, failed refresh keeps it | `src/data/__tests__/offline-flow.test.ts` |
| Expired session / 401 erases the copy; sign-out and account switch erase it | `src/auth/__tests__/session.test.ts` |
| Edit conflict: 409 leaves cache untouched, keep-mine resends, use-latest, deleted-elsewhere | `src/data/__tests__/conflicts.test.ts` |
| Server precondition (409 with current copy, no write) | `backend/tests/Feature/Api/MemoryConflictTest.php` |
