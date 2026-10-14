import { router, type Href } from 'expo-router';

const WINDOW_MS = 700;
let last: { key: string; at: number } | null = null;

/**
 * `router.push` that ignores the same destination pushed again within a moment. A fast double-tap on a card
 * would otherwise stack two identical screens (two editors, two detail pages) that Back then has to unwind.
 */
export function pushOnce(href: Href, now: number = Date.now()): void {
  const key = typeof href === 'string' ? href : JSON.stringify(href);
  if (last && last.key === key && now - last.at < WINDOW_MS) return;
  last = { key, at: now };
  router.push(href);
}

/** For tests. */
export const __resetPushOnce = () => {
  last = null;
};
