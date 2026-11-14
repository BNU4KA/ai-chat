import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';

export function useMotionPaused() {
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => setHidden(document.visibilityState === 'hidden');
      update();
      document.addEventListener('visibilitychange', update);
      return () => document.removeEventListener('visibilitychange', update);
    }
    setHidden(AppState.currentState !== null && AppState.currentState !== 'active');
    const listener = AppState.addEventListener('change', (state) => setHidden(state !== 'active'));
    return () => listener.remove();
  }, []);
  return reduced || hidden;
}

export function haptic() {
  if (Platform.OS !== 'ios') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
