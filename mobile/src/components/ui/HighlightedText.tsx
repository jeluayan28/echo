import { Fragment } from 'react';

import { colors } from '@/theme';

import { Text, type TextProps } from './Text';

export type HighlightedTextProps = Omit<TextProps, 'children'> & {
  text: string;
  /** [start, end) character ranges to highlight; must be sorted and non-overlapping. */
  ranges: [number, number][];
};

/** Text with matching spans emphasized (tinted background, full-contrast color and bolder — never color alone). */
export function HighlightedText({ text, ranges, ...rest }: HighlightedTextProps) {
  if (ranges.length === 0) return <Text {...rest}>{text}</Text>;
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });

  return (
    <Text {...rest}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p.hit ? (
            <Text style={{ backgroundColor: colors.violetTint, color: colors.text, fontWeight: '700' }}>{p.text}</Text>
          ) : (
            p.text
          )}
        </Fragment>
      ))}
    </Text>
  );
}
