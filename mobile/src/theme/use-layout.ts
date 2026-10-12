import { useWindowDimensions } from 'react-native';

import { layout, spacing } from './tokens';

/**
 * Responsive helpers derived from the current window.
 * Small phones (<360dp wide, e.g. older Android / iPhone SE) get tighter gutters;
 * wide screens are capped so content stays readable.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isCompact = width < 360;
  const gutter = isCompact ? spacing.md : spacing.lg;
  const contentWidth = Math.min(width, layout.maxContentWidth);
  return { width, height, isCompact, gutter, contentWidth };
}
