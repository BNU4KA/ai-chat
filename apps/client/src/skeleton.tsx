import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';
import { useLocale } from './locale';
import { useMotionPaused } from './motion';
import { radii, spacing, useTheme, type ThemeColors } from './theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

interface SkeletonGroupProps {
  label?: string;
  children: ReactNode;
  style?: ViewStyle;
}

interface ActivityMarkProps {
  label?: string;
  size?: number;
}

interface AppSkeletonProps {
  label?: string;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    block: {
      backgroundColor: colors.skeleton,
      overflow: 'hidden',
    },
    shimmer: {
      backgroundColor: 'rgba(255,255,255,0.12)',
      bottom: 0,
      position: 'absolute',
      top: 0,
      width: '45%',
    },
    group: {
      gap: spacing.md,
    },
    activity: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
    },
    dot: {
      backgroundColor: colors.muted,
      borderRadius: radii.round,
    },
    app: {
      alignItems: 'center',
      backgroundColor: colors.background,
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    appCard: {
      gap: spacing.lg,
      maxWidth: 720,
      width: '100%',
    },
    messageBody: {
      gap: spacing.sm,
    },
    userRow: {
      alignItems: 'flex-end',
    },
  });
}

export function Skeleton({
  width = '100%',
  height = 14,
  radius = radii.sm,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useMotionPaused();
  const phase = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    phase.setValue(0);
    if (reduced || Platform.OS === 'web') return;
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, reduced]);

  return (
    <View
      testID="skeleton"
      style={[styles.block, { width, height, borderRadius: radius }, style]}
    >
      {Platform.OS !== 'web' && !reduced ? (
        <Animated.View
          style={[
            styles.shimmer,
            {
              transform: [
                {
                  translateX: phase.interpolate({
                    inputRange: [0, 0.7, 1],
                    outputRange: [-360, 900, 900],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export function SkeletonGroup({
  label = 'Loading',
  children,
  style,
}: SkeletonGroupProps) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t(label)}
      style={[styles.group, style]}
    >
      {children}
    </View>
  );
}

export function ActivityMark({ label = 'Loading', size = 5 }: ActivityMarkProps) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const reduced = useMotionPaused();
  const phase = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (reduced) {
      phase.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [phase, reduced]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t(label)}
      style={styles.activity}
    >
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              opacity: reduced
                ? 0.7
                : phase.interpolate({
                    inputRange: [0, 0.25 * index, 0.5 + 0.2 * index, 1],
                    outputRange: [0.3, 0.3, 1, 0.3],
                  }),
            },
          ]}
        />
      ))}
    </View>
  );
}

export function AppSkeleton({ label = 'Loading' }: AppSkeletonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.app}>
      <SkeletonGroup label={label} style={styles.appCard}>
        <View style={styles.userRow}>
          <Skeleton width="38%" height={44} radius={18} />
        </View>
        <View style={styles.messageBody}>
          <Skeleton width="74%" />
          <Skeleton width="92%" />
          <Skeleton width="48%" />
        </View>
        <Skeleton height={54} radius={radii.lg} />
      </SkeletonGroup>
    </View>
  );
}
