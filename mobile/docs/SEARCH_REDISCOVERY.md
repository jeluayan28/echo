# Search, Rediscovery and Reminders

All three are local and rule-based. No network, no paid AI.

## Search (`src/features/search/`)
- `engine.ts` (pure): every query term must appear in the title, content or tags (case/accent-insensitive).
  Score: title word-start 10 · title contains 6 · tag exact 5 · tag contains 3 · content 2–3 · exact phrase bonus.
  Filters: type, collection, tags (ALL must match), favorites. Sort: relevance (only with a query), recently
  updated, recently created. `matchRanges` / `snippet` drive highlighting.
- `use-search.ts`: runs on a **250 ms-debounced** query, drops stale responses, keeps previous results while
  refreshing, exposes `loading | ready | error` + `retry`. In dev, `window.__ECHO_FAIL_SEARCH = true` forces the error state.
- `history.ts`: recent searches (max 8, deduped, case-insensitive). Recorded on keyboard "search" or when a result is
  opened — never per keystroke. Clear-all and remove-one.
- **Semantic search extension point:** implement `SearchProvider` (may be async) and pass it with `lexicalProvider`
  to `useSearch` / `runSearch`. Hits are merged by best score; filters, sorting and UI need no change.

## Rediscovery (`src/features/rediscovery/rules.ts`)
Priority (a memory is suggested once, under its highest rule): **reminder due** → **connected to the memory being
viewed** (idle ≥ 3 d) → **pinned** (idle ≥ 3 d) → **not opened/edited for ≥ 7 d**. Every card says *why*.
- Actions: open, favorite, snooze (tomorrow / 3 days / next week), dismiss.
- Repeat control (stored per memory in `rediscovery`): snooze hides every rule until it ends; dismiss hides for 14 days,
  except a reminder that comes due *after* the dismissal. Opening a memory resets idle time.
- Shown on Home (top suggestion) and on a memory ("Worth revisiting": linked memories you haven't opened).

## Reminders (`src/features/reminders/`)
- One reminder per memory, chosen from presets (1 hour, this evening, tomorrow morning, next Monday).
- `service.ts` takes a `NotificationsPort` (so it's unit-tested without the OS); `notifications.ts` is the
  `expo-notifications` adapter (local DATE-trigger notifications, Android channel, tap → opens the memory).
- Permission: asked the first time. Denied → the reminder is kept **in-app only** (shown by Rediscovery once due) and
  the UI says so, with an "open settings" button when blocked. Web is in-app only.
- Replacing a reminder never leaves two notifications; a failed cancel keeps the record so the user can retry;
  deleting a memory cancels its notification once the Undo window closes, and Undo restores the reminder.
- **No delivery guarantee.** The OS decides when/if to show a notification (battery saver, Do Not Disturb, force-stop,
  iOS notification limits). Nothing runs in the background.
- Opening a memory after its reminder is due fulfils (clears) the reminder.

## Not persisted yet
Like the rest of the sample data layer, reminders, snoozes, dismissals and recent searches live in memory and are lost
on app restart (scheduled OS notifications may outlive the record; tapping one for a missing memory shows
"Memory not found"). They persist when the API replaces `store.ts`.
