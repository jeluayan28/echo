/**
 * Whether the server can be reached, as observed by real requests (see `setReachabilityListener` in the API
 * client). No network-info module is needed, and "the radio is on" never gets confused with "ECHO answers".
 * Only a failed attempt to reach the server marks us offline; HTTP errors (500, 401, 429) are not offline.
 */
import { useSyncExternalStore } from 'react';

import { setReachabilityListener } from '@/api/client';

export type Connectivity = { online: boolean; offlineSince?: number };

let state: Connectivity = { online: true };
const listeners = new Set<() => void>();

function set(next: Connectivity) {
  if (next.online === state.online) return;
  state = next;
  listeners.forEach((l) => l());
}

export const connectivity = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Back to the optimistic default (sign-out, tests). */
  reset: () => set({ online: true }),
};

setReachabilityListener((reachable) => set(reachable ? { online: true } : { online: false, offlineSince: Date.now() }));

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(connectivity.subscribe, connectivity.get, connectivity.get);
}
