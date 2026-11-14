import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './locale-ui';
import { useMotionPaused } from './motion';
import { useTheme } from './theme';

export function GreetingName({ name }: { name: string }) {
  const { colors: c, isDark } = useTheme();
  const reduced = useMotionPaused();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced || Platform.OS === 'web') return;
    progress.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduced]);

  const peak = isDark ? '#a5d0ff' : '#0356b8';
  const animated = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 0.5, 1], [c.greeting, c.info, peak]),
  }));

  if (Platform.OS === 'web' && !reduced) {
    return (
      <Text
        translate={false}
        style={
          {
            fontWeight: '600',
            color: c.info,
            backgroundImage: isDark
              ? 'linear-gradient(90deg, #ececec, #63a8f8, #a5d0ff, #63a8f8, #ececec)'
              : 'linear-gradient(90deg, #0d0d0d, #0285ff, #0356b8, #0285ff, #0d0d0d)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'ai-chat-name-shimmer 3.2s ease-in-out infinite',
          } as Record<string, unknown>
        }
      >
        {name}
      </Text>
    );
  }

  return (
    <Animated.Text style={[styles.name, reduced ? { color: c.info } : animated]}>{name}</Animated.Text>
  );
}

const styles = StyleSheet.create({ name: { fontWeight: '600' } });
