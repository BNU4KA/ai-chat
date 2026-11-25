import { Pressable, Text } from './locale-ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Modal, Platform, ScrollView, View } from 'react-native';
import { ChatGptIcon } from './chatgpt-icons';
import { useTheme } from './theme';

export function Dialog({
  title,
  visible,
  close,
  children,
  header,
  loading = false,
}: {
  title: string;
  visible: boolean;
  close: () => void;
  children: ReactNode;
  header?: ReactNode;
  loading?: boolean;
}) {
  const { colors: c, isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(10);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)',
        }}
      >
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={close}
          style={{ position: 'absolute', inset: 0 }}
        />
        <Animated.View
          testID="dialog-panel"
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '85%',
            backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.border,
            padding: 20,
            gap: 14,
            opacity,
            transform: [{ translateY }],
            ...(Platform.OS === 'web'
              ? {
                  boxShadow: isDark
                    ? '0 16px 48px rgba(0, 0, 0, 0.55)'
                    : '0 12px 40px rgba(0, 0, 0, 0.14)',
                }
              : {}),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingBottom: 4,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ fontSize: 18, fontWeight: '600', color: c.text, flex: 1 }}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              onPress={close}
              style={({ hovered, pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hovered || pressed ? c.hover : 'transparent',
              })}
            >
              <ChatGptIcon name="close" size={16} color={c.muted} />
            </Pressable>
          </View>
          {header ? <View testID="dialog-header">{header}</View> : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ gap: 10 }}
          >
            {loading ? (
              <View style={{ gap: 10, paddingVertical: 8 }}>
                {[0.92, 1, 0.7].map((w, i) => (
                  <View
                    key={i}
                    testID="dialog-skeleton-line"
                    style={{
                      height: 12,
                      width: `${w * 100}%`,
                      borderRadius: 6,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,13,13,0.08)',
                    }}
                  />
                ))}
              </View>
            ) : (
              children
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
