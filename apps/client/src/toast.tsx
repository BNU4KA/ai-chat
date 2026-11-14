import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './locale-ui';
import { useTheme } from './theme';

let push: ((message: string) => void) | null = null;
let nextToast = 0;

export function showToast(message: string) {
  push?.(message);
}

export function ToastHost() {
  const { colors: c } = useTheme();
  const inset = useSafeAreaInsets();
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const slide = useRef(new Animated.Value(120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    push = (message) => setToast({ id: ++nextToast, message });
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    slide.setValue(120);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(slide, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
    const hide = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slide, {
          toValue: 140,
          duration: 260,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setToast(null);
      });
    }, 2400);
    return () => clearTimeout(hide);
  }, [toast, slide, opacity]);

  if (!toast) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <View pointerEvents="none" style={{ flex: 1 }}>
        <Animated.View
          key={toast.id}
          testID="toast"
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            top: Math.max(inset.top, 12) + 4,
            right: 0,
            maxWidth: 340,
            marginRight: 12,
            paddingVertical: 12,
            paddingLeft: 16,
            paddingRight: 14,
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
            backgroundColor: c.text,
            opacity,
            transform: [{ translateX: slide }],
            shadowColor: '#000',
            shadowOffset: { width: -4, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 18,
            elevation: 20,
          }}
        >
          <Text style={{ color: c.background, fontSize: 14, lineHeight: 20 }}>{toast.message}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}
