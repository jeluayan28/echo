import { useEffect, useState } from 'react';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/theme';
import { overlayTimings } from '@/theme/overlay-timings';

/**
 * Drives enter/exit animation for overlays. `mounted` stays true until the exit
 * animation has finished so the RN <Modal> isn't torn down mid-animation.
 * Enter decelerates into place, exit accelerates away; both are 0ms under "reduce motion".
 */
export function useOverlayTransition(visible: boolean) {
  const { base } = useMotion();
  const { enter, exit } = overlayTimings(base);
  const progress = useSharedValue(visible ? 1 : 0);
  const [prevVisible, setPrevVisible] = useState(visible);
  const [exiting, setExiting] = useState(false);

  // Adjust state during render (React-sanctioned) when `visible` flips.
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    setExiting(!visible);
  }

  useEffect(() => {
    progress.set(
      withTiming(visible ? 1 : 0, {
        duration: visible ? enter : exit,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      }),
    );
    if (visible) return;
    const t = setTimeout(() => setExiting(false), exit);
    return () => clearTimeout(t);
  }, [visible, enter, exit, progress]);

  return { mounted: visible || exiting, progress };
}
