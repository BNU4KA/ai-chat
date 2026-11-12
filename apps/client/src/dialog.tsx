import { useMemo, useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, Text } from './locale-ui';
import { Copy, IconButton } from './ui';
import { radii, spacing, typography, useTheme, type ThemeColors } from './theme';

interface DialogProps {
  title: string;
  help?: string;
  visible: boolean;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}

interface HelpProps {
  title: string;
  text: string;
}

interface SectionProps {
  title: string;
  help: string;
  children: ReactNode;
  testID?: string;
}

function createStyles(
  colors: ThemeColors,
  compact: boolean,
  wide: boolean,
  topInset = 0,
  bottomInset = 0,
) {
  return StyleSheet.create({
    overlay: {
      alignItems: 'center',
      backgroundColor: colors.overlay,
      flex: 1,
      justifyContent: 'center',
      padding: compact ? 0 : spacing.lg,
    },
    dismiss: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    panel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: compact ? 0 : radii.lg,
      borderWidth: compact ? 0 : 1,
      gap: spacing.lg,
      height: compact ? '100%' : undefined,
      maxHeight: compact ? '100%' : wide ? '92%' : '86%',
      maxWidth: wide ? 960 : 640,
      padding: compact ? spacing.lg : spacing.xl,
      paddingBottom: compact ? Math.max(bottomInset, spacing.lg) : spacing.xl,
      paddingTop: compact ? Math.max(topInset, spacing.lg) : spacing.xl,
      width: '100%',
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: 36,
    },
    title: {
      color: colors.text,
      flex: 1,
      fontSize: typography.title,
      fontWeight: '600',
    },
    content: {
      gap: spacing.lg,
      paddingBottom: spacing.lg,
    },
    helpButton: {
      alignItems: 'center',
      borderRadius: radii.round,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    helpText: {
      color: colors.muted,
      fontSize: typography.body,
      fontWeight: '600',
    },
    section: {
      gap: spacing.md,
    },
    sectionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: colors.text,
      flex: 1,
      fontSize: typography.input,
      fontWeight: '600',
    },
  });
}

export function Dialog({
  title,
  help,
  visible,
  close,
  children,
  wide = false,
}: DialogProps) {
  const { colors: c } = useTheme();
  const compact = useWindowDimensions().width < 700;
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(c, compact, wide, insets.top, insets.bottom),
    [c, compact, wide, insets.top, insets.bottom],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close dialog" onPress={close} style={styles.dismiss} />
        <View
          testID="dialog-panel"
          accessibilityViewIsModal
          style={styles.panel}
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {help ? <Help title={title} text={help} /> : null}
            <IconButton label="Close dialog" onPress={close}>
              ×
            </IconButton>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function Help({ title, text }: HelpProps) {
  const [open, setOpen] = useState(false);
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c, false, false), [c]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="More information"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ hovered, pressed }) => [
          styles.helpButton,
          { backgroundColor: hovered || pressed ? c.hover : 'transparent' },
        ]}
      >
        <Text style={styles.helpText}>i</Text>
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
}: SectionProps) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c, false, false), [c]);

  return (
    <View testID={testID} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
        <Help title={title} text={help} />
      </View>
      {children}
    </View>
  );
}
