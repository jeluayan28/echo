/**
 * ECHO design tokens — the single source of truth for visual values.
 * Components must import from here; never hard-code colors, spacing or radii.
 */

export const colors = {
  // Surfaces
  void: '#090B14',
  surface: '#17152B',
  surfaceAlt: '#211E38',
  border: '#302B49',
  overlay: 'rgba(9, 11, 20, 0.72)',

  // Accents
  violet: '#9B7BFF',
  cyan: '#46E6D4',

  // Text
  text: '#E9E5FF',
  textMuted: '#A6A1BC',
  /** Text placed on a violet / cyan / success fill. */
  onAccent: '#090B14',

  // Status
  error: '#FF647C',
  success: '#63E6BE',

  // Tints (accent at low opacity) for selected / highlighted backgrounds
  violetTint: 'rgba(155, 123, 255, 0.16)',
  cyanTint: 'rgba(70, 230, 212, 0.14)',
  errorTint: 'rgba(255, 100, 124, 0.14)',
  successTint: 'rgba(99, 230, 190, 0.14)',
} as const;

/** 8-point scale with a 4pt half-step for tight spots. */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Minimum touch target (Apple HIG 44, Material 48). */
export const hitTarget = 48;

export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'overline'
  | 'numeric';

type TextStyleToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
  fontVariant?: ('tabular-nums')[];
};

export const typography: Record<TextVariant, TextStyleToken> = {
  display: { fontFamily: fontFamily.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  subheading: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  numeric: {
    fontFamily: fontFamily.semibold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
};

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/** Subtle depth: a hairline border does most of the work; shadow is reserved for floating layers. */
export const elevation = {
  floating: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
} as const;

/** Glow is used once per screen at most — on the primary action or a selected node. */
export const glow = (color: string) => ({
  shadowColor: color,
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 0 },
  elevation: 6,
});

export const layout = {
  /** Content never stretches beyond this on tablets / foldables. */
  maxContentWidth: 640,
  tabBarHeight: 64,
} as const;
