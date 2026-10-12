import { useEffect, useState } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/theme';

/**
 * Drives enter/exit animation for overlays. `mounted` stays true until the exit
 * animation has finished so the RN <Modal> isn't torn down mid-animation.
 */
export function useOverlayTransition(visible: boolean) {
  const { base } = useMotion();
  const progress = useSharedValue(visible ? 1 : 0);
  const [prevVisible, setPrevVisible] = useState(visible);
  const [exiting, setExiting] = useState(false);

  // Adjust state during render (React-sanctioned) when `visible` flips.
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    setExiting(!visible);
  }

  useEffect(() => {
    progress.set(withTiming(visible ? 1 : 0, { duration: base }));
    if (visible) return;
    const t = setTimeout(() => setExiting(false), base);
    return () => clearTimeout(t);
  }, [visible, base, progress]);

  return { mounted: visible || exiting, progress };
}
