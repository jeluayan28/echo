/**
 * The signed-in session: restore on launch, sign in / up, sign out, and what happens when the server
 * says the token is no longer good.
 *
 * The token lives in secure storage and in a module variable (so every request can attach it); it is never
 * put in React state, props, navigation params or logs.
 */
import { useSyncExternalStore } from 'react';

import { authApi, setAuthHooks } from '@/api';
import { toProfile } from '@/api/mappers';
import { store } from '@/data/store';
import { resetSync, runSync } from '@/data/sync';
import type { Profile } from '@/data/types';
import { cancelAllReminderNotifications } from '@/features/reminders/notifications';
import { resetSemanticStatus } from '@/features/semantic/status';
import { recentSearches } from '@/features/search/history';

import { clearSession, loadSession, saveSession } from './secure-storage';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';
export type SessionState = {
  status: SessionStatus;
  user?: Profile;
  /** Why the user is looking at the login screen (e.g. their session expired). Shown once. */
  notice?: string;
};

let state: SessionState = { status: 'restoring' };
let token: string | null = null;
let expiresAt: string | null = null;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

export const session = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}

/** Wipe everything that belongs to the account that is leaving. */
async function wipeLocalData() {
  token = null;
  store.reset();
  resetSync();
  recentSearches.clear();
  resetSemanticStatus();
  await Promise.allSettled([clearSession(), cancelAllReminderNotifications()]);
}

async function startSession(payload: { token: string; expires_at: string | null; user: Parameters<typeof toProfile>[0] }) {
  const user = toProfile(payload.user);
  store.reset({ profile: user }); // a clean slate: nothing from a previous account can leak in
  resetSync();
  token = payload.token;
  expiresAt = payload.expires_at;
  try {
    await saveSession({ token: payload.token, expiresAt: payload.expires_at, user });
  } catch {
    // Secure storage unavailable: the session works until the app closes, then the user signs in again.
  }
  set({ status: 'signedIn', user });
  void runSync('initial');
}

/** Called once at launch. Reads the stored token; the first API call proves whether it is still valid. */
export async function restoreSession(): Promise<void> {
  const saved = await loadSession();
  if (!saved || (saved.expiresAt && Date.parse(saved.expiresAt) <= Date.now())) {
    await clearSession();
    set({ status: 'signedOut' });
    return;
  }
  token = saved.token;
  expiresAt = saved.expiresAt;
  store.reset({ profile: saved.user });
  set({ status: 'signedIn', user: saved.user });
  void runSync('initial');
}

export async function signIn(input: authApi.LoginInput): Promise<void> {
  await startSession(await authApi.login(input));
}

export async function signUp(input: authApi.RegisterInput): Promise<void> {
  await startSession(await authApi.register(input));
}

/** Revokes the token on the server (best effort) and always clears this device. */
export async function signOut(): Promise<void> {
  try {
    if (token) await authApi.logout();
  } catch {
    // Offline or already expired: the device is still signed out. The token dies on its own expiry.
  }
  await wipeLocalData();
  set({ status: 'signedOut' });
}

/** The server rejected our token: drop the session and tell the user why. */
export function expireSession(): void {
  if (state.status !== 'signedIn') return;
  void wipeLocalData();
  set({ status: 'signedOut', notice: 'Your session has ended. Please sign in again.' });
}

export function clearNotice() {
  if (state.notice) set({ ...state, notice: undefined });
}

/** Keep the cached greeting in step when the profile changes. */
export function updateSessionUser(user: Profile) {
  if (state.status !== 'signedIn') return;
  set({ ...state, user });
  if (token) void saveSession({ token, expiresAt, user }).catch(() => undefined);
}

setAuthHooks({ getToken: () => token, onUnauthorized: expireSession });
