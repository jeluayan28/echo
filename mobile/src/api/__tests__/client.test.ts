import { installFakeServer } from '@/test-utils/fake-server';

import { ApiError, NetworkError, http, parseErrorBody, setAuthHooks } from '../client';

jest.mock('@/config/env', () => ({
  getApiBaseUrl: () => 'http://test.local/api/v1',
  ConfigError: class ConfigError extends Error {},
}));

const onUnauthorized = jest.fn();
let token: string | null = 'tok';
let server: ReturnType<typeof installFakeServer>;

beforeEach(() => {
  server = installFakeServer();
  onUnauthorized.mockReset();
  token = 'tok';
  setAuthHooks({ getToken: () => token, onUnauthorized });
});

describe('request', () => {
  it('attaches the token to authenticated requests only', async () => {
    await http.get('/me');
    await http.get('/me', { auth: false });
    expect(server.calls[0].auth).toBe('Bearer tok');
    expect(server.calls[1].auth).toBeUndefined();
  });

  it('turns a 401 on an authenticated request into onUnauthorized + ApiError', async () => {
    server.failNext({ status: 401, body: { message: 'Unauthenticated.' } });
    await expect(http.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('a 401 from login (wrong password) is NOT an expired session', async () => {
    server.failNext({ status: 401, body: { message: 'The provided credentials are incorrect.' } });
    await expect(http.post('/auth/login', {}, { auth: false })).rejects.toMatchObject({
      message: 'The provided credentials are incorrect.',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('retries a GET once after a network failure', async () => {
    server.failNext('network');
    await expect(http.get('/me')).resolves.toBeDefined();
    expect(server.calls).toHaveLength(2);
  });

  it('never retries a write', async () => {
    server.failNext('network');
    await expect(http.post('/memories', { title: 'x', type: 'note' })).rejects.toBeInstanceOf(NetworkError);
    expect(server.calls).toHaveLength(1);
  });

  it('gives up after one retry', async () => {
    server.fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(http.get('/me')).rejects.toBeInstanceOf(NetworkError);
    expect(server.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('copes with a non-JSON error page', async () => {
    server.fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      headers: { get: () => null },
      json: async () => {
        throw new Error('<html>');
      },
    } as unknown as Response);
    await expect(http.get('/me')).rejects.toMatchObject({ status: 502, message: expect.stringContaining('server') });
  });

  it('builds query strings, skipping undefined and encoding values', async () => {
    await http.get('/memories', { query: { q: 'a b&c', page: 2, favorite: true, tag: undefined } });
    const url = String(server.fetchMock.mock.calls[0][0]);
    expect(url).toBe('http://test.local/api/v1/memories?q=a%20b%26c&page=2&favorite=1');
  });
});

describe('parseErrorBody', () => {
  it('flattens Laravel validation errors to the first message per field', () => {
    const e = parseErrorBody(422, { message: 'x', errors: { email: ['Taken.', 'Other'], password: ['Weak.'] } });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.isValidation).toBe(true);
    expect(e.fieldErrors).toEqual({ email: 'Taken.', password: 'Weak.' });
  });

  it('never exposes a server stack trace for 5xx', () => {
    expect(parseErrorBody(500, { message: 'SQLSTATE[08006] secret details' }).message).not.toContain('SQLSTATE');
  });
});
