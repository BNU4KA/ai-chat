import { Pressable, Text } from './locale-ui';
import type { ReactNode } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Button, Panel } from './ui';
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
  const { colors: c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
          backgroundColor: '#00000070',
        }}
      >
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={close}
          style={{ position: 'absolute', inset: 0 }}
        />
        <Panel testID="dialog-panel" style={{ width: '100%', maxWidth: 640, maxHeight: '85%' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ fontSize: 21, fontWeight: '700', color: c.text, flex: 1 }}
            >
              {title}
            </Text>
            <Button secondary onPress={close} label="Close dialog">
              ×
            </Button>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            {children}
          </ScrollView>
        </Panel>
      </View>
    </Modal>
  );
}
