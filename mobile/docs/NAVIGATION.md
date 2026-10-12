# Navigation & screen structure

## Routes (`src/app`, Expo Router)

| Route | File | Notes |
|---|---|---|
| `/` | `(tabs)/index.tsx` | Memory Core dashboard |
| `/map` | `(tabs)/map.tsx` | Neural Map (graph rendering is a later step; lists real links) |
| `/capture` | `(tabs)/capture.tsx` | Never shown: redirects to `/memory/new` |
| `/search` | `(tabs)/search.tsx` | Query + type filter + browse by tag |
| `/vault` | `(tabs)/vault.tsx` | All · Collections · Tags · Favorites |
| `/memory/[id]` | `memory/[id]/index.tsx` | Detail: pin, favorite, edit, delete, open link |
| `/memory/new` | `memory/new.tsx` | Modal. Save → replaces modal with the new memory's detail |
| `/memory/[id]/edit` | `memory/[id]/edit.tsx` | Modal. Save → back to detail |
| `/collection/[id]` | `collection/[id].tsx` | Collection detail |
| `/search-results?q&type&tag` | `search-results.tsx` | Filters live in URL params |
| `/settings` | `settings.tsx` | Profile & settings (opened from the Core header) |
| `/login`, `/register` | `(auth)/*.tsx` | Switch between each other with `replace` |

All route names and params are defined once in `src/navigation/routes.ts`. Navigate with
`router.push(routes.memory(id))`, never with string paths. Read params with
`useLocalSearchParams<{ id: string }>()`.

**Back navigation:** `useSafeBack()` pops the stack, or falls back to Memory Core when there is
no history (deep link / web reload). Every secondary screen uses it.

**Tab bar:** `(tabs)/_layout.tsx` uses Expo Router's headless tabs. Capture is an *action* button
(opens the modal) in the center slot; it is not a selectable tab. Quirk handled in
`components/ui/TabBar.tsx`: `<TabTrigger asChild>` forwards the `TabList` style onto each child, so
tab buttons ignore the injected `style`.

## Folder layout

```
src/
  app/            routes only (thin screens that compose features)
  components/ui/  design system        components/layout/  ScreenHeader, SectionHeader, ListRow
  features/       screen-specific components: core, memory, search, vault, auth
  data/           types, hooks (screen-facing), store + sample-data (temporary), selectors
  navigation/     routes.ts, use-safe-back.ts
  theme/          tokens + hooks
  lib/            format helpers
```

## Data layer: repository boundary

```
screens → hooks.ts (reads, memoryActions) → repository.ts (EchoRepository interface)
                                               └─ sample-repository.ts → store.ts + sample-data.ts   ← temporary
                                               └─ (later) api-repository.ts → Laravel
```

Screens only use `src/data/hooks.ts`. Writes return Promises (`create`, `update`, `remove`,
`markOpened`, `link`, `unlink`, `dismissRediscovery`) so callers already handle async + failure.
To connect the API: implement `EchoRepository`, change the one export in `repository.ts`, and delete
`sample-*.ts` / `store.ts`. Sample data resets on reload.

Dev/test hooks (only when `__DEV__`): `window.__ECHO_FAIL_FIRST_SYNC = n` before load makes the first
`n` syncs fail; `__echoSample.failNextSync(n)` and `__echoSample.deleteAll()` from the console.

## Memory Core dashboard (`(tabs)/index.tsx`)

Top bar (ECHO mark + profile avatar → Settings) · greeting · status panel · Quick Capture ·
Continue exploring · Rediscover · Recent connections. `useDashboard()` owns loading/refresh/error:
first load shows skeletons (Quick Capture is always usable), a failed first load shows `ErrorState`
with retry, a failed pull-to-refresh keeps cached data and shows a toast. Every count and list is
derived from live data in `data/selectors.ts`.

- **Status:** memory count, collection count, and the most recently *edited* memory.
- **Quick Capture:** `routes.newMemory(type)` → `/memory/new?type=note|idea|link|voice`; the form preselects the type.
  Voice uses `expo-audio` (microphone permission set in `app.json`; recordings saved to the document directory).
- **Continue exploring:** most recent activity = latest of `lastOpenedAt` (set when a detail screen opens) and `updatedAt`.
- **Rediscover — the rule (no AI):** a memory is eligible after 7+ days with no open or edit; the one idle
  longest is shown (ties → more links); anything dismissed today is skipped. Opening or editing resets idle time,
  so suggestions rotate. Favoriting/pinning does *not* count as touching. Actions: Open, favorite, dismiss
  (dismissals last for the current day). The card states why it was chosen.
- **Recent connections:** user-created links (made from a memory's "Link a memory" sheet), newest first, max 4.

## Intentionally inert (not fake)

- Settings rows for Profile / Theme / Privacy / Notifications render as dimmed "Soon" rows, not buttons.
- Login/Register validate input, then show a toast saying authentication connects in the next step.
- Collections can't be created/edited yet; the Map has no graph canvas yet.
