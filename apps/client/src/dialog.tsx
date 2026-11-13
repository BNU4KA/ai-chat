import { Pressable, Text } from './locale-ui';
import type { ReactNode } from 'react';
import { Modal, Platform, ScrollView, View } from 'react-native';
import { ChatGptIcon } from './chatgpt-icons';
import { useTheme } from './theme';

export function Dialog({
  title,
  visible,
  close,
  children,
}: {
  title: string;
  visible: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const { colors: c, isDark } = useTheme();
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
        <View
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
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
