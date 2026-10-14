/**
 * Environment-specific API configuration — the ONE place that decides which server the app talks to.
 *
 * Variables (all `EXPO_PUBLIC_*`, so they are bundled into the app: never put a secret in them):
 *   EXPO_PUBLIC_APP_ENV              development | staging | production   (default: development in dev builds, production otherwise)
 *   EXPO_PUBLIC_API_URL              development override, e.g. http://192.168.1.20:8000/api
 *   EXPO_PUBLIC_API_URL_STAGING      staging API root, e.g. https://api.staging.example.com/api
 *   EXPO_PUBLIC_API_URL_PRODUCTION   production API root, e.g. https://api.example.com/api
 *
 * "localhost" on a phone is the phone itself, so in development a loopback host is rewritten to an address the
 * device can actually reach: the machine running Metro for a physical device, 10.0.2.2 for the Android emulator.
 * With no override at all, development derives the address from the Metro host — nothing to configure.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type AppEnv = 'development' | 'staging' | 'production';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** The API prefix the Laravel routes live under (routes/api.php mounts everything at /v1). */
export const API_VERSION_PATH = '/v1';

const DEV_PORT = 8000;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export type RawEnv = {
  appEnv?: string;
  apiUrl?: string;
  apiUrlStaging?: string;
  apiUrlProduction?: string;
};

export type Runtime = {
  isDev: boolean;
  os: string;
  isPhysicalDevice: boolean;
  /** Host of the Metro dev server (the developer's computer), when known. */
  metroHost?: string;
};

export function resolveAppEnv(raw: RawEnv, isDev: boolean): AppEnv {
  const value = raw.appEnv?.trim().toLowerCase();
  if (value === 'development' || value === 'staging' || value === 'production') return value;
  return isDev ? 'development' : 'production';
}

/** Parses "host:port" / "host" from Expo's `hostUri` and returns just the host. */
export function hostFromHostUri(hostUri: string | null | undefined): string | undefined {
  if (!hostUri) return undefined;
  const host = hostUri.replace(/^[a-z]+:\/\//i, '').split('/')[0].replace(/:\d+$/, '');
  return host || undefined;
}

function parseUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ConfigError(`${label} is not a valid URL.`);
  }
}

/** Swaps a loopback host for one the current device can reach (development only). */
export function reachableDevUrl(value: string, runtime: Runtime): string {
  const url = parseUrl(value, 'EXPO_PUBLIC_API_URL');
  if (!LOOPBACK.has(url.hostname) || runtime.os === 'web') return value;
  if (runtime.isPhysicalDevice) {
    if (!runtime.metroHost) {
      throw new ConfigError(
        'The API URL points at localhost, which on a phone is the phone itself. Set EXPO_PUBLIC_API_URL to your computer’s LAN address.',
      );
    }
    url.hostname = runtime.metroHost;
  } else if (runtime.os === 'android') {
    url.hostname = '10.0.2.2'; // the Android emulator's alias for the host computer
  }
  return url.toString();
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

/** Resolves the API root (without the version prefix). Throws `ConfigError` when it cannot be trusted. */
export function resolveApiRoot(raw: RawEnv, runtime: Runtime): string {
  const env = resolveAppEnv(raw, runtime.isDev);

  if (env === 'production' || env === 'staging') {
    const label = env === 'production' ? 'EXPO_PUBLIC_API_URL_PRODUCTION' : 'EXPO_PUBLIC_API_URL_STAGING';
    const value = (env === 'production' ? raw.apiUrlProduction : raw.apiUrlStaging)?.trim();
    if (!value) throw new ConfigError(`${label} is not set, so the app doesn’t know which server to use.`);
    // Credentials and notes travel over this connection: never plain HTTP outside development.
    if (parseUrl(value, label).protocol !== 'https:') throw new ConfigError(`${label} must use https://.`);
    return trimSlash(value);
  }

  const explicit = raw.apiUrl?.trim();
  if (explicit) return trimSlash(reachableDevUrl(explicit, runtime));

  if (runtime.os === 'web') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `http://${host}:${DEV_PORT}/api`;
  }
  if (runtime.metroHost) return `http://${runtime.metroHost}:${DEV_PORT}/api`;
  if (runtime.os === 'android') return `http://10.0.2.2:${DEV_PORT}/api`;
  return `http://localhost:${DEV_PORT}/api`; // iOS simulator shares the host's network
}

function currentRuntime(): Runtime {
  return {
    isDev: __DEV__,
    os: Platform.OS,
    isPhysicalDevice: Device.isDevice,
    metroHost: hostFromHostUri(Constants.expoConfig?.hostUri),
  };
}

let cached: string | undefined;

/** Full base URL every request is built from, e.g. `http://192.168.1.20:8000/api/v1`. */
export function getApiBaseUrl(): string {
  if (cached) return cached;
  // Literal `process.env.EXPO_PUBLIC_*` reads are what Expo inlines at bundle time.
  const root = resolveApiRoot(
    {
      appEnv: process.env.EXPO_PUBLIC_APP_ENV,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      apiUrlStaging: process.env.EXPO_PUBLIC_API_URL_STAGING,
      apiUrlProduction: process.env.EXPO_PUBLIC_API_URL_PRODUCTION,
    },
    currentRuntime(),
  );
  cached = `${root}${API_VERSION_PATH}`;
  return cached;
}
