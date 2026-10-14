/**
 * Where the login token lives.
 *
 * iOS Keychain / Android Keystore through expo-secure-store — never AsyncStorage, never a plain file, never
 * a log. The token is readable only on this device (`…THIS_DEVICE_ONLY`) and only after the first unlock.
 *
 * Web has no secure store. There the session is kept in `sessionStorage` (gone when the tab closes) — good
 * enough for the development web build, and the reason the web build must not be the production target.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Profile } from '@/data/types';

const TOKEN_KEY = 'echo.session.token';
const META_KEY = 'echo.session.meta';

export type StoredSession = {
  token: string;
  /** ISO 8601, when the server will stop accepting the token. */
  expiresAt: string | null;
  /** Last known profile, so the UI can greet the user before the network answers. */
  user: Profile;
};

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function webStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

async function read(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webStorage()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key, OPTIONS);
}

async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, OPTIONS);
}

async function remove(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key, OPTIONS);
}

export async function saveSession(session: StoredSession): Promise<void> {
  await write(TOKEN_KEY, session.token);
  await write(META_KEY, JSON.stringify({ expiresAt: session.expiresAt, user: session.user }));
}

/** Returns null when nothing usable is stored. Never throws: a corrupt or unreadable entry means "signed out". */
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const token = await read(TOKEN_KEY);
    if (!token) return null;
    const meta = JSON.parse((await read(META_KEY)) ?? '{}') as Partial<Pick<StoredSession, 'expiresAt' | 'user'>>;
    return { token, expiresAt: meta.expiresAt ?? null, user: meta.user ?? { name: '' } };
  } catch {
    return null;
  }
}

/** Best-effort wipe. Both entries are always attempted. */
export async function clearSession(): Promise<void> {
  await Promise.allSettled([remove(TOKEN_KEY), remove(META_KEY)]);
}
