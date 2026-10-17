import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';

import { colors } from '@/theme';

/**
 * ECHO icon system: one family (Feather — 24px grid, 2px rounded stroke) for visual consistency.
 * Only names in this map are usable, so screens can't drift to arbitrary icons.
 */
const icons = {
  core: 'cpu',
  search: 'search',
  map: 'share-2',
  settings: 'settings',
  add: 'plus',
  close: 'x',
  check: 'check',
  favorite: 'star',
  pin: 'bookmark',
  link: 'link',
  voice: 'mic',
  play: 'play',
  pause: 'pause',
  stop: 'square',
  dismiss: 'eye-off',
  note: 'file-text',
  idea: 'zap',
  collection: 'layers',
  folder: 'folder',
  tag: 'hash',
  edit: 'edit-2',
  delete: 'trash-2',
  more: 'more-horizontal',
  filter: 'filter',
  bell: 'bell',
  user: 'user',
  lock: 'lock',
  eye: 'eye',
  eyeOff: 'eye-off',
  chevronRight: 'chevron-right',
  chevronLeft: 'chevron-left',
  error: 'alert-circle',
  success: 'check-circle',
  info: 'info',
  clock: 'clock',
  list: 'list',
  recenter: 'crosshair',
  zoomIn: 'plus',
  zoomOut: 'minus',
  dream: 'moon',
  skip: 'skip-forward',
} as const satisfies Record<string, ComponentProps<typeof Feather>['name']>;

export type IconName = keyof typeof icons;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 20, color = colors.text }: IconProps) {
  // Decorative by default; the parent control provides the accessible label.
  return (
    <Feather
      name={icons[name]}
      size={size}
      color={color}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
