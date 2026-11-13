import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useMotionPaused } from './motion';
import { useTheme } from './theme';
import { useLocale } from './locale';

export function FoolSpinner({
  size = 24,
  label = 'Loading',
  style,
}: {
  size?: number;
  label?: string;
  style?: ViewStyle;
}) {
  const reduced = useMotionPaused();
  const { colors: c } = useTheme();
  const { t } = useLocale();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === 'web' || reduced) return;
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      spin.setValue(0);
    };
  }, [reduced, spin]);

  const spinnerSize = Math.min(size, 32);

  return (
    <View
      testID="fool-spinner"
      accessibilityRole="progressbar"
      accessibilityLabel={t(label)}
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Animated.View
        testID="chatgpt-spinner-ring"
        style={
          Platform.OS === 'web'
            ? undefined
            : {
                transform: [
                  {
                    rotate: spin.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              }
        }
      >
        <Svg width={spinnerSize} height={spinnerSize} viewBox="0 0 24 24" fill="none">
          <Circle
            cx={12}
            cy={12}
            r={9}
            stroke={c.border}
            strokeWidth={2.2}
          />
          <Path
            d="M12 3a9 9 0 0 1 9 9"
            stroke={c.text}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export function ThinkingDot() {
  const reduced = useMotionPaused();
  const { colors: c } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === 'web' || reduced) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.28,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [reduced, scale]);

  return (
    <Animated.View
      testID="chatgpt-thinking-dot"
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: c.text,
        transform: Platform.OS === 'web' ? undefined : [{ scale }],
      }}
    />
  );
}
