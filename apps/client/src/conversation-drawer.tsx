import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Pressable } from './locale-ui';

export interface ConversationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

const DURATION = 240;
const EASING = Easing.bezier(0.2, 0, 0, 1);
const FLING_VELOCITY = 450;

export function ConversationDrawer({ open, onOpenChange, children }: ConversationDrawerProps) {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(300, width - 48);
  const reduced = useReducedMotion();
  const duration = reduced ? 0 : DURATION;
  const progress = useSharedValue(open ? 1 : 0);
  const start = useSharedValue(0);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    progress.value = withTiming(open ? 1 : 0, { duration, easing: EASING }, (finished) => {
      if (finished && !open) scheduleOnRN(setMounted, false);
    });
  }, [open, duration, progress]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onOpenChange]);

  const panConfig = useMemo(() => ({
    activeOffsetX: [-12, 12] as [number, number],
    failOffsetY: [-16, 16] as [number, number],
    onBegin: () => {
      'worklet';
      start.value = progress.value;
      scheduleOnRN(setMounted, true);
    },
    onUpdate: (event: { translationX: number }) => {
      'worklet';
      progress.value = Math.min(1, Math.max(0, start.value + event.translationX / panelWidth));
    },
    onDeactivate: (event: { velocityX: number }) => {
      'worklet';
      const next =
        event.velocityX > FLING_VELOCITY ||
        (event.velocityX > -FLING_VELOCITY && progress.value > 0.5);
      progress.value = withTiming(next ? 1 : 0, { duration, easing: EASING }, (finished) => {
        if (finished && !next) scheduleOnRN(setMounted, false);
      });
      scheduleOnRN(onOpenChange, next);
    },
  }), [duration, onOpenChange, panelWidth, progress, start]);
  const edgePan = usePanGesture(panConfig);
  const panelPan = usePanGesture(panConfig);

  const shown = open || mounted;
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * panelWidth }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <View pointerEvents="box-none" style={styles.root} collapsable={false}>
      {!open && (
        <GestureDetector gesture={edgePan}>
          <View testID="sidebar-edge-swipe" style={styles.edge} />
        </GestureDetector>
      )}
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.backdrop, !shown && styles.hidden, backdropStyle]}>
        <Pressable
          testID="drawer-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Dismiss conversation history"
          onPress={() => onOpenChange(false)}
          style={styles.fill}
        />
      </Animated.View>
      <GestureDetector gesture={panelPan}>
        <Animated.View
          testID="drawer-panel"
          accessibilityViewIsModal={open}
          style={[styles.panel, { width: panelWidth }, !shown && styles.hidden, panelStyle]}
        >
          {shown && children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 80 },
  fill: { flex: 1 },
  hidden: { display: 'none' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, zIndex: 40 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 45,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
    boxShadow: '6px 0 20px rgba(0, 0, 0, 0.22)',
  },
});
