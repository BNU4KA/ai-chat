import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View, type DimensionValue, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from './locale-ui';
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
          <Circle cx={12} cy={12} r={9} stroke={c.border} strokeWidth={2.2} />
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

const SKELETON_WIDTHS: DimensionValue[] = ['88%', '96%', '62%'];

export function ThinkingSkeleton() {
  const reduced = useMotionPaused();
  const { colors: c, isDark } = useTheme();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (Platform.OS === 'web' || reduced) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.95,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced]);

  const webGradient = isDark
    ? 'linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.06) 75%)'
    : 'linear-gradient(90deg, rgba(13,13,13,0.06) 25%, rgba(13,13,13,0.12) 50%, rgba(13,13,13,0.06) 75%)';

  return (
    <View style={{ gap: 10, paddingVertical: 4, maxWidth: 520, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <ThinkingDot />
        <Text testID="chatgpt-thinking-text" style={{ fontSize: 14, color: c.muted }}>
          Thinking…
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        {SKELETON_WIDTHS.map((width, index) => (
          <Animated.View
            key={index}
            testID="thinking-skeleton-line"
            style={{
              height: 12,
              width,
              borderRadius: 6,
              backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(13,13,13,0.07)',
              opacity: Platform.OS === 'web' ? 1 : pulse,
              ...(Platform.OS === 'web'
                ? ({ backgroundImage: webGradient } as Record<string, unknown>)
                : {}),
            }}
          />
        ))}
      </View>
    </View>
  );
}
