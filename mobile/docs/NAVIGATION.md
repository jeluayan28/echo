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

## Sample data vs. the future API

Screens only call hooks in `src/data/hooks.ts` (`useMemories`, `useMemory`, `memoryActions`, …).
Today those are backed by `store.ts`, an in-memory store seeded from `sample-data.ts`; changes
last until the app reloads. When the Laravel API exists, replace the store internals with `src/api`
calls plus a query cache and delete `sample-data.ts`; screens should not change.

## Intentionally inert (not fake)

- Settings rows for Profile / Theme / Privacy / Notifications render as dimmed "Soon" rows, not buttons.
- Login/Register validate input, then show a toast saying authentication connects in the next step.
- Voice memos can't be created yet; collections can't be created/edited yet; the Map has no graph canvas yet.
