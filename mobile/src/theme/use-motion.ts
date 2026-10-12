import { useReducedMotion } from 'react-native-reanimated';

import { motion } from './tokens';

/** Animation durations that collapse to 0 when the OS "reduce motion" setting is on. */
export function useMotion() {
  const reduced = useReducedMotion();
  return {
    reduced,
    fast: reduced ? 0 : motion.fast,
    base: reduced ? 0 : motion.base,
    slow: reduced ? 0 : motion.slow,
  };
}
