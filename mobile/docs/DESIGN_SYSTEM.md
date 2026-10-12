# ECHO Design System

A dark, calm, slightly mysterious system for a personal memory vault. Everything lives in two places:

| Path | Contains |
|---|---|
| `src/theme/` | Tokens (`tokens.ts`) and responsive/motion hooks |
| `src/components/ui/` | Reusable components, all exported from `@/components/ui` |

Preview everything live: run the app (`npx expo start`), open the **Core** tab, tap **Open design system** (dev builds only; route `src/app/design-system.tsx`).

## Principles

1. **Violet acts, cyan means.** Violet = primary action and active navigation. Cyan is rare: connections, favorites, selected checkboxes, section labels in the showcase. If a screen has more than a few cyan elements, something is wrong.
2. **Depth from borders, not glows.** Surfaces separate with a 1px `border`. A glow is used only on the primary button; shadows only on floating layers (sheet, dialog, toast).
3. **Quiet motion.** Presses scale to 0.97, switches/overlays animate 200ms. The only looping animation is the skeleton pulse. All durations collapse to 0 when the OS "reduce motion" setting is on (`useMotion`).
4. **Never color alone.** State is also carried by icon, label, or `accessibilityState`.
5. **Tokens only.** No hex values, magic spacings, or font names in screens.

## Tokens (`@/theme`)

**Color** — `colors.void #090B14` (page), `surface #17152B` (cards, sheets, inputs), `surfaceAlt #211E38` (raised/hovered/secondary), `border #302B49`, `violet #9B7BFF`, `cyan #46E6D4`, `text #E9E5FF`, `textMuted #A6A1BC`, `error #FF647C`, `success #63E6BE`. Derived: `*Tint` (accent at 14–16% alpha, for selected backgrounds), `overlay`, `onAccent` (= void, text on accent fills).

**Spacing (8pt grid)** — `xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48`.

**Radius** — `sm 8 · md 12 · lg 16 · xl 24 · pill`. Inputs/buttons `md`, cards `lg`, sheets/dialogs `xl`, chips/search/switch `pill`.

**Touch target** — `hitTarget = 48`. All buttons, inputs, rows and tabs meet it (chips are 32 tall with extra `hitSlop`).

**Typography** — Inter (400/500/600/700 via `@expo-google-fonts/inter`, loaded in the root layout).

| Variant | Size/Line | Use |
|---|---|---|
| `display` | 32/40 bold | Screen hero ("Memory Core") |
| `title` | 24/32 semibold | Page titles |
| `heading` | 18/24 semibold | Card titles, sheet titles |
| `subheading` | 16/24 medium | Row labels |
| `body` / `bodyStrong` | 15/22 | Content |
| `caption` | 13/18 | Metadata, helper/error text |
| `overline` | 11/16 caps, tracked | Section labels, type labels |
| `numeric` | 28/34 tabular | Stats and counts |

Text scales with the OS font size but is capped at 1.4× so layouts hold at "Largest".

**Responsive** — `useLayout()` returns `gutter` (16 below 360dp wide, else 24) and caps content at `layout.maxContentWidth` (640) on tablets/foldables. `Screen` applies both.

## Components

All import from `@/components/ui`.

### Text
`<Text variant="heading" tone="muted">…</Text>` — tones: `default | muted | violet | cyan | error | success | onAccent`. `display`/`title` get the header role.

### Icon
`<Icon name="favorite" size={20} color={colors.cyan} />` — one family (Feather) restricted to a named map in `Icon.tsx`. To add an icon, add a semantic name there (e.g. `idea → zap`) rather than using raw Feather names in screens. Icons are decorative; give the parent control a label.

### Button / IconButton
```tsx
<Button label="Capture" icon="add" onPress={…} />                  // primary (violet, glow)
<Button label="Cancel" variant="secondary" />                      // also: ghost, danger
<Button label="Saving" loading />                                  // spinner, press disabled, busy a11y
<Button label="Delete" variant="danger" disabled />
<IconButton icon="favorite" label="Favorite" active={fav} />      // active = cyan; label is required
```
States: pressed (scale + light haptic), disabled (40% opacity), loading, focus via platform default.

### TextField / SearchBar
```tsx
<TextField label="Title" value={v} onChangeText={setV} helper="Optional" />
<TextField label="Password" error="Too short" secureTextEntry />
<TextField label="Note" multiline />            // text area, 128 min height
<SearchBar value={q} onChangeText={setQ} />     // pill, clear button appears when non-empty
```
Focused = violet border + raised fill; error = red border + live-region message; disabled = 50%.

### Chip
`<Chip label="research" />` static tag · `<Chip label="Ideas" icon="idea" count={12} selected onPress={…} />` filter (violet tint when selected) · `<Chip label="x" onRemove={…} />` removable.

### MemoryCard / CollectionCard
```tsx
<MemoryCard type="idea" title="…" preview="…" tags={['a','b']} date="2 days ago"
  pinned favorite linkCount={5} onPress={…} />
<CollectionCard name="Product ideas" memoryCount={18} onPress={…} />
```
`type`: `note | idea | link | voice`. Pinned = violet bookmark, favorite = cyan star, link count = cyan. At most 3 tags shown. The card announces a single combined accessibility label. Format dates in the caller.

### Navigation
`TabBarButton` + `useTabBarStyle` power the bottom tabs via Expo Router's headless tabs — see `src/app/(tabs)/_layout.tsx`. Labels are always visible; active = violet icon in a tinted pill. Safe-area bottom inset is handled.

### Sheet / ConfirmDialog
```tsx
<Sheet visible={open} onClose={() => setOpen(false)} title="Add to collection">…</Sheet>
<ConfirmDialog visible={d} destructive title="Delete?" message="…" confirmLabel="Delete"
  onConfirm={…} onCancel={…} />
```
Both animate in/out, dismiss via backdrop and Android back, and trap accessibility focus. Dialog buttons: ghost cancel + primary/danger confirm.

### Feedback
```tsx
const toast = useToast();           // <ToastProvider> is mounted in the root layout
toast.show('Memory saved', 'success');   // 'success' | 'error' | 'info'
<MemoryCardSkeleton />  <Skeleton width={120} height={12} />
<EmptyState title="…" message="…" actionLabel="Capture" onAction={…} />   // violet, an invitation
<ErrorState onRetry={…} />                                                 // red, always offers retry
```
Toasts auto-dismiss in ~3s and are announced to screen readers.

### Switch / Checkbox
```tsx
<Switch label="Daily summary" description="…" value={v} onValueChange={setV} />
<Checkbox label="I agree" checked={c} onChange={setC} />
```
The whole row is the touch target (≥48dp). Roles `switch`/`checkbox` with `checked` state. Switch on = violet; checkbox checked = cyan.

### Screen
`<Screen scroll>…</Screen>` — void background, top safe area, responsive gutter, max-width centering, 16 gap between children. Pass `edges={['top','bottom']}` on screens outside the tab bar.

## Contrast (WCAG, computed)

| Pair | Ratio |
|---|---|
| text / void · surface | 16.0 · 14.5 |
| muted / void · surface · surfaceAlt | 7.9 · 7.2 · 6.5 |
| void on violet (button) | 6.2 |
| violet on void · surface | 6.2 · 5.7 |
| cyan on surface | 11.5 |
| error on void · surface | 6.9 · 6.2 |

All text pairs exceed AA (4.5:1). **Known trade-off:** the `border` color (#302B49) is ~1.5:1 against void by design (quiet look); input boundaries therefore also rely on the surface fill and a violet focus ring (5.7:1+). If stricter non-text contrast is required, brighten `colors.border` for inputs only.

## Platform notes

- Haptics (`expo-haptics`) fire on button press, switch/checkbox toggles and tab changes; skipped on web.
- Animations use Reanimated 4 (`react-native-reanimated` 4.5.1) with the React Compiler enabled — mutate shared values with `.set()`, not `.value =`, inside callbacks.
- Tabs use `expo-router/ui` (headless), not NativeTabs, so the bar matches the design on both platforms.
- No web CSS framework is used; styling is `StyleSheet` + tokens only.
