import type { SemanticStatusDto } from '@/api/dto';

import {
  canSearchByMeaning,
  fallbackMessage,
  getSemanticState,
  refreshSemanticStatus,
  resetSemanticStatus,
  statusOf,
  unavailableMessage,
} from '../status';

const mockGetStatus = jest.fn();
jest.mock('@/api', () => ({ semanticApi: { getStatus: (...a: unknown[]) => mockGetStatus(...a) } }));

const status = (over: Partial<SemanticStatusDto> = {}): SemanticStatusDto => ({
  available: true,
  enabled: true,
  state: 'ready',
  reason: null,
  processing: 'self-hosted',
  provider: 'a server',
  disclosure: 'text',
  consent_version: 1,
  indexed: 3,
  total: 3,
  ...over,
});

beforeEach(() => {
  mockGetStatus.mockReset();
  resetSemanticStatus();
});

describe('canSearchByMeaning', () => {
  it('needs the server to say it works AND the user to have opted in', () => {
    expect(canSearchByMeaning(status())).toBe(true);
    expect(canSearchByMeaning(status({ state: 'indexing', indexed: 1 }))).toBe(true);
    expect(canSearchByMeaning(status({ enabled: false, state: 'off' }))).toBe(false);
    expect(canSearchByMeaning(status({ available: false, state: 'unavailable', reason: 'provider_down' }))).toBe(false);
    expect(canSearchByMeaning(status({ available: false, enabled: true, state: 'ready' }))).toBe(false);
  });

  it('is false until the server has answered', () => {
    expect(canSearchByMeaning(undefined)).toBe(false);
  });
});

describe('the shared availability state', () => {
  it('only acts on a successful answer from the server', async () => {
    expect(statusOf(getSemanticState())).toBeUndefined();

    mockGetStatus.mockResolvedValue(status());
    await refreshSemanticStatus({ force: true });

    expect(getSemanticState().phase).toBe('ready');
    expect(statusOf(getSemanticState())).toEqual(status());
  });

  it('reuses a fresh answer instead of asking again', async () => {
    mockGetStatus.mockResolvedValue(status());
    await refreshSemanticStatus();
    await refreshSemanticStatus();
    expect(mockGetStatus).toHaveBeenCalledTimes(1);

    await refreshSemanticStatus({ force: true });
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    let resolve!: (s: SemanticStatusDto) => void;
    mockGetStatus.mockReturnValue(new Promise<SemanticStatusDto>((r) => (resolve = r)));

    const a = refreshSemanticStatus({ force: true });
    const b = refreshSemanticStatus({ force: true });
    resolve(status());
    await Promise.all([a, b]);

    expect(mockGetStatus).toHaveBeenCalledTimes(1);
  });

  it('treats a failed check as "unavailable", never as "available"', async () => {
    mockGetStatus.mockResolvedValue(status());
    await refreshSemanticStatus({ force: true });
    expect(canSearchByMeaning(statusOf(getSemanticState()))).toBe(true);

    mockGetStatus.mockRejectedValue(new Error('offline'));
    await refreshSemanticStatus({ force: true });

    expect(getSemanticState().phase).toBe('error');
    expect(statusOf(getSemanticState())).toBeUndefined();
    expect(canSearchByMeaning(statusOf(getSemanticState()))).toBe(false);
  });

  it('drops an answer that arrives after sign-out, so it cannot leak into the next account', async () => {
    let resolve!: (s: SemanticStatusDto) => void;
    mockGetStatus.mockReturnValue(new Promise<SemanticStatusDto>((r) => (resolve = r)));

    const pending = refreshSemanticStatus({ force: true });
    resetSemanticStatus(); // signed out while the request was in flight
    resolve(status());
    await pending;

    expect(getSemanticState().phase).toBe('unknown');
    expect(statusOf(getSemanticState())).toBeUndefined();
  });
});

describe('wording', () => {
  it('explains each reason without blaming the user', () => {
    expect(unavailableMessage('not_configured')).toMatch(/isn’t set up/);
    expect(unavailableMessage('no_vector_store')).toMatch(/database support/);
    expect(unavailableMessage('provider_down')).toMatch(/Normal search still works/);
    expect(unavailableMessage('error')).toMatch(/Normal search still works/);
  });

  it('always tells the user when they are looking at keyword results', () => {
    for (const reason of ['provider_error', 'provider_down', 'not_enabled', 'not_configured', 'no_vector_store', 'unknown', null]) {
      expect(fallbackMessage(reason)).toMatch(/keyword results/);
    }
  });
});
