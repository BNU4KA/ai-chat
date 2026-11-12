import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './locale-ui';
import { useTheme } from './theme';

let push: ((message: string) => void) | null = null;
let nextToast = 0;

export function showToast(message: string) {
  push?.(message);
}

export function ToastHost() {
  const { colors: c } = useTheme();
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  useEffect(() => {
    push = (message) => setToast({ id: ++nextToast, message });
    return () => {
      push = null;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 16, right: 16, zIndex: 40 }}>
      <View
        key={toast.id}
        testID="toast"
        accessibilityLiveRegion="polite"
        style={{
          maxWidth: 340,
          paddingVertical: 12,
          paddingLeft: 16,
          paddingRight: 14,
          borderRadius: 12,
          backgroundColor: c.text,
          borderWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.16,
          shadowRadius: 18,
          elevation: 8,
        }}
      >
        <Text style={{ color: c.background, fontSize: 14, lineHeight: 20 }}>{toast.message}</Text>
      </View>
    </View>
  );
}
