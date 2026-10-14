import { useState } from 'react';

/**
 * Lets only one async action run at a time; a second call while the first is in flight is ignored (returns
 * undefined). A `busy` React state can't do this alone: two taps in the same frame both see it as false.
 */
export function createSingleFlight() {
  let flying = false;
  return async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (flying) return undefined;
    flying = true;
    try {
      return await task();
    } finally {
      flying = false;
    }
  };
}

export function useSingleFlight() {
  // Lazy state initializer: created once per component instance, never read from a ref during render.
  const [run] = useState(createSingleFlight);
  return run;
}
