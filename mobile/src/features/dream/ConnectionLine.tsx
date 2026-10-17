import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Stop } from 'react-native-svg';

import { colors } from '@/theme';

/** Two nodes joined by a glowing violet→cyan line. Dashed while the link is only a suggestion. */
export function ConnectionLine({ confirmed = false, height = 28 }: { confirmed?: boolean; height?: number }) {
  const y = height / 2;
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="dreamLine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.violet} />
            <Stop offset="1" stopColor={colors.cyan} />
          </LinearGradient>
        </Defs>
        <Line x1="12" x2="98%" y1={y} y2={y} stroke="url(#dreamLine)" strokeOpacity={0.25} strokeWidth={8} strokeLinecap="round" />
        <Line
          x1="12"
          x2="98%"
          y1={y}
          y2={y}
          stroke="url(#dreamLine)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={confirmed ? undefined : '6 6'}
        />
        <Circle cx="8" cy={y} r="6" fill={colors.violet} />
        <Circle cx="98%" cy={y} r="6" fill={colors.cyan} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { width: '100%' } });
