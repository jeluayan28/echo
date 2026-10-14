import { hostFromHostUri, resolveApiRoot, resolveAppEnv, type Runtime } from '../env';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('expo-device', () => ({ isDevice: false }));

const dev = (over: Partial<Runtime> = {}): Runtime => ({ isDev: true, os: 'ios', isPhysicalDevice: false, ...over });

describe('hostFromHostUri', () => {
  it('extracts the host from Metro host URIs', () => {
    expect(hostFromHostUri('192.168.1.20:8081')).toBe('192.168.1.20');
    expect(hostFromHostUri('exp://192.168.1.20:8081/--/x')).toBe('192.168.1.20');
    expect(hostFromHostUri(undefined)).toBeUndefined();
  });
});

describe('resolveAppEnv', () => {
  it('defaults by build type and honours an explicit value', () => {
    expect(resolveAppEnv({}, true)).toBe('development');
    expect(resolveAppEnv({}, false)).toBe('production');
    expect(resolveAppEnv({ appEnv: 'Staging' }, false)).toBe('staging');
    expect(resolveAppEnv({ appEnv: 'nonsense' }, false)).toBe('production');
  });
});

describe('resolveApiRoot — development', () => {
  it('uses the Metro host so a physical phone reaches the computer, not itself', () => {
    expect(resolveApiRoot({}, dev({ isPhysicalDevice: true, metroHost: '192.168.1.20' }))).toBe('http://192.168.1.20:8000/api');
  });

  it('rewrites localhost in an override for a physical phone', () => {
    const url = resolveApiRoot({ apiUrl: 'http://localhost:8000/api' }, dev({ os: 'android', isPhysicalDevice: true, metroHost: '10.0.0.5' }));
    expect(url).toBe('http://10.0.0.5:8000/api');
  });

  it('refuses localhost on a physical phone when the computer is unknown', () => {
    expect(() => resolveApiRoot({ apiUrl: 'http://localhost:8000/api' }, dev({ isPhysicalDevice: true }))).toThrow(/phone itself/);
  });

  it('maps localhost to 10.0.2.2 on the Android emulator', () => {
    expect(resolveApiRoot({ apiUrl: 'http://127.0.0.1:8000/api' }, dev({ os: 'android' }))).toBe('http://10.0.2.2:8000/api');
  });

  it('leaves an explicit LAN address alone', () => {
    expect(resolveApiRoot({ apiUrl: 'http://192.168.1.9:8000/api/' }, dev({ isPhysicalDevice: true, metroHost: '1.1.1.1' }))).toBe(
      'http://192.168.1.9:8000/api',
    );
  });
});

describe('resolveApiRoot — staging and production', () => {
  it('requires the matching variable', () => {
    expect(() => resolveApiRoot({ appEnv: 'production' }, dev({ isDev: false }))).toThrow(/PRODUCTION/);
    expect(() => resolveApiRoot({ appEnv: 'staging' }, dev({ isDev: false }))).toThrow(/STAGING/);
  });

  it('only accepts https', () => {
    expect(() => resolveApiRoot({ appEnv: 'production', apiUrlProduction: 'http://api.example.com/api' }, dev({ isDev: false }))).toThrow(/https/);
    expect(resolveApiRoot({ appEnv: 'production', apiUrlProduction: 'https://api.example.com/api/' }, dev({ isDev: false }))).toBe(
      'https://api.example.com/api',
    );
  });

  it('ignores the development override outside development', () => {
    expect(() => resolveApiRoot({ appEnv: 'production', apiUrl: 'http://192.168.1.9:8000/api' }, dev({ isDev: false }))).toThrow();
  });
});
