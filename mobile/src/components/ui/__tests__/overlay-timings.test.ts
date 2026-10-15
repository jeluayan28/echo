import { overlayTimings } from '@/theme/overlay-timings';

describe('overlayTimings', () => {
  it('leaves a little faster than it enters', () => {
    const { enter, exit } = overlayTimings(200);
    expect(enter).toBe(200);
    expect(exit).toBe(150);
    expect(exit).toBeLessThan(enter);
  });

  it('is instant when reduce-motion has collapsed the base duration to 0', () => {
    expect(overlayTimings(0)).toEqual({ enter: 0, exit: 0 });
  });
});
