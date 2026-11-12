import { useState, type ReactNode } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Pressable, Text } from './locale-ui';
import { Copy, IconButton, Panel } from './ui';
import { useTheme } from './theme';
export function Dialog({
  title,
  help,
  visible,
  close,
  children,
  wide = false,
}: {
  title: string;
  help?: string;
  visible: boolean;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
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
        <Panel
          testID="dialog-panel"
          style={{ width: '100%', maxWidth: wide ? 960 : 640, maxHeight: wide ? '92%' : '85%' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              accessibilityRole="header"
              style={{ fontSize: 21, fontWeight: '700', color: c.text, flex: 1 }}
            >
              {title}
            </Text>
            {help ? <Help title={title} text={help} /> : null}
            <IconButton label="Close dialog" onPress={close}>
              ×
            </IconButton>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>
            {children}
          </ScrollView>
        </Panel>
      </View>
    </Modal>
  );
}
export function Help({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const { colors: c } = useTheme();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More information"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ hovered, pressed }) => ({
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hovered || pressed ? c.hover : 'transparent',
        })}
      >
        <Text style={{ color: c.muted, fontSize: 13, fontWeight: '700' }}>i</Text>
      </Pressable>
      {open ? (
        <Dialog title={title} visible close={() => setOpen(false)}>
          <Copy>{text}</Copy>
        </Dialog>
      ) : null}
    </>
  );
}
export function Section({
  title,
  help,
  children,
  testID,
}: {
  title: string;
  help: string;
  children: ReactNode;
  testID?: string;
}) {
  const { colors: c } = useTheme();
  return (
    <View testID={testID} style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: c.text, fontSize: 15, fontWeight: '600', flex: 1 }}
        >
          {title}
        </Text>
        <Help title={title} text={help} />
      </View>
      {children}
    </View>
  );
}
