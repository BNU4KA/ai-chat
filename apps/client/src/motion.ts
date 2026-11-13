import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
function prefersReducedMotion() {
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
  )
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return Platform.OS !== 'web';
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReduced(query.matches);
      update();
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return reduced;
}

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
