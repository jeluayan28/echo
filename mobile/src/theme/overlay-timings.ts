/** Entering takes the full base duration; leaving is a little quicker, so dismissing feels responsive. */
export function overlayTimings(base: number) {
  return { enter: base, exit: Math.round(base * 0.75) };
}
