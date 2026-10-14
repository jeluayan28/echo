import { router } from 'expo-router';

import { __resetPushOnce, pushOnce } from '../push-once';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

beforeEach(() => {
  __resetPushOnce();
  jest.mocked(router.push).mockClear();
});

describe('pushOnce', () => {
  it('ignores the same destination pushed again within the window (double tap)', () => {
    pushOnce({ pathname: '/memory/[id]', params: { id: 'a' } } as never, 1000);
    pushOnce({ pathname: '/memory/[id]', params: { id: 'a' } } as never, 1200);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('allows the same destination again after the window', () => {
    pushOnce('/settings' as never, 1000);
    pushOnce('/settings' as never, 2000);
    expect(router.push).toHaveBeenCalledTimes(2);
  });

  it('never blocks a different destination', () => {
    pushOnce({ pathname: '/memory/[id]', params: { id: 'a' } } as never, 1000);
    pushOnce({ pathname: '/memory/[id]', params: { id: 'b' } } as never, 1001);
    expect(router.push).toHaveBeenCalledTimes(2);
  });
});
