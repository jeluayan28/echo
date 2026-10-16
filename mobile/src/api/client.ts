/**
 * The one HTTP client. Every request to the Laravel API goes through `request()`.
 *
 * - Base URL comes from `config/env.ts` (never hardcoded).
 * - The bearer token is read from the session through `setAuthHooks` (this file knows nothing about storage).
 * - Failures are typed: `ApiError` (the server answered with an error), `NetworkError` (no usable answer:
 *   offline, DNS, timeout), `ConfigError` (no valid API URL).
 * - Idempotent GETs are retried once after a network failure. Writes are NEVER retried automatically —
 *   a retry could create a duplicate; the user decides.
 *
 * Privacy: nothing here logs. Request bodies, tokens and response bodies never reach a log or an error message.
 */
import { getApiBaseUrl } from '@/config/env';

export { ConfigError } from '@/config/env';

export const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 600;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Laravel validation errors: field → first message. Only on 422. */
    public readonly fieldErrors: Record<string, string> = {},
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isValidation() {
    return this.status === 422;
  }
}

/**
 * 409 `conflict` from an edit that was based on an older version: nothing was written, and `current` is the
 * server's full copy (raw wire format; the data layer maps it). Other 409s stay plain `ApiError`s.
 */
export class ConflictError extends ApiError {
  constructor(
    message: string,
    public readonly current: Record<string, unknown>,
  ) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class NetworkError extends Error {
  constructor(
    message = 'Can’t reach ECHO right now. Check your connection and try again.',
    public readonly timedOut = false,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** The caller aborted (screen closed, user cancelled). Not a failure worth reporting. */
export class RequestCancelled extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'RequestCancelled';
  }
}

type AuthHooks = {
  getToken: () => string | null;
  /** Called when the server rejects the token on an authenticated request (expired / revoked). */
  onUnauthorized: () => void;
};

type ReachabilityListener = (reachable: boolean) => void;
let reachability: ReachabilityListener = () => undefined;

/** Told after every request whether the server could be reached at all (any HTTP answer counts). */
export function setReachabilityListener(listener: ReachabilityListener) {
  reachability = listener;
}

let hooks: AuthHooks = { getToken: () => null, onUnauthorized: () => undefined };

export function setAuthHooks(next: AuthHooks) {
  hooks = next;
}

/** For the one call that can't go through `fetch` (the upload) so it sees the same token and expiry handling. */
export const getAuthToken = () => hooks.getToken();
export const notifyUnauthorized = () => hooks.onUnauthorized();

export type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Public endpoints (login, register) send no token and don't treat 401 as an expired session. */
  auth?: boolean;
  timeoutMs?: number;
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function buildUrl(path: string, query?: Query): string {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'boolean' ? (v ? '1' : '0') : String(v))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

/** Extracts Laravel's `{ message, errors: { field: [msg] } }` shape without trusting it. */
export function parseErrorBody(status: number, body: unknown, retryAfter?: number): ApiError {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const fieldErrors: Record<string, string> = {};
  if (record.errors && typeof record.errors === 'object') {
    for (const [field, messages] of Object.entries(record.errors as Record<string, unknown>)) {
      const first = Array.isArray(messages) ? messages[0] : messages;
      if (typeof first === 'string') fieldErrors[field] = first;
    }
  }
  const serverMessage = typeof record.message === 'string' ? record.message : undefined;
  if (status === 409 && record.code === 'conflict' && record.current && typeof record.current === 'object') {
    return new ConflictError(serverMessage ?? 'This memory was changed somewhere else.', record.current as Record<string, unknown>);
  }
  return new ApiError(status, friendlyMessage(status, serverMessage), fieldErrors, retryAfter);
}

function friendlyMessage(status: number, serverMessage?: string): string {
  if (status === 429) return 'Too many attempts. Wait a moment and try again.';
  if (status >= 500) return 'ECHO’s server had a problem. Please try again in a moment.';
  if (status === 404) return 'That couldn’t be found. It may have been deleted.';
  // 4xx messages from our own API are written for users ("The provided credentials are incorrect.").
  return serverMessage ?? 'Something went wrong. Please try again.';
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function once(method: Method, path: string, options: RequestOptions): Promise<unknown> {
  const { query, body, signal, auth = true, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  if (signal?.aborted) throw new RequestCancelled();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = hooks.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // Built outside the try: a bad API URL is a ConfigError the user/developer must see, not a "no connection".
  let url: string;
  try {
    url = buildUrl(path, query);
  } catch (e) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    throw e;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) throw new RequestCancelled();
    reachability(false);
    throw timedOut ? new NetworkError('ECHO took too long to respond. Please try again.', true) : new NetworkError();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  reachability(true); // the server answered (even with an error page from a proxy, handled below)
  if (response.status === 204) return undefined;

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined; // an HTML error page from a proxy, an empty body, …
  }

  // A 2xx that isn't our JSON is a captive-portal / proxy page, not the API: never treat it as data.
  if (response.ok && json === undefined) {
    reachability(false);
    throw new NetworkError('ECHO sent an unexpected response. Check your connection (or sign in to the Wi-Fi) and try again.');
  }

  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || undefined;
    const error = parseErrorBody(response.status, json, retryAfter);
    if (response.status === 401 && auth) hooks.onUnauthorized();
    throw error;
  }
  return json;
}

export async function request<T = unknown>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return (await once(method, path, options)) as T;
  } catch (error) {
    // Only reads are retried, and only when the network (not the server) failed.
    if (method === 'GET' && error instanceof NetworkError && !error.timedOut) {
      await wait(RETRY_DELAY_MS);
      return (await once(method, path, options)) as T;
    }
    throw error;
  }
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T = void>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};

// ── pagination ────────────────────────────────────────────────────────────────

export type Page<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; total: number; per_page: number };
};

/**
 * Walks every page of a list endpoint (the Neural Map and the offline-friendly cache need the whole set).
 * `maxPages` is a safety net, not a feature: when it trips, `truncated` says so instead of failing silently.
 */
export async function fetchAllPages<T>(
  path: string,
  query: Query = {},
  { perPage = 100, maxPages = 50, signal }: { perPage?: number; maxPages?: number; signal?: AbortSignal } = {},
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const res = await http.get<Page<T>>(path, { query: { ...query, per_page: perPage, page }, signal });
    items.push(...res.data);
    if (page >= res.meta.last_page) return { items, truncated: false };
    if (page >= maxPages) return { items, truncated: true };
    page += 1;
  }
}
