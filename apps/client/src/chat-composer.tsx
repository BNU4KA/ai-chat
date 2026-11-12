import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './locale-ui';
import { spacing, typography, useTheme, type ThemeColors } from './theme';
import { Button, Copy, ErrorNotice } from './ui';

interface ChatComposerProps {
  wide: boolean;
  reconnecting: boolean;
  credentialConfigured: boolean;
  incompatibleError?: string;
  imageError?: string;
  error: unknown;
  children: ReactNode;
  onOpenKey: () => void;
}

function createStyles(colors: ThemeColors, wide: boolean) {
  return StyleSheet.create({
    root: {
      alignSelf: 'center',
      gap: spacing.sm,
      maxWidth: 768,
      paddingBottom: wide ? spacing.md : spacing.sm,
      paddingHorizontal: wide ? spacing.xl : spacing.md,
      paddingTop: spacing.sm,
      width: '100%',
    },
    reconnecting: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'center',
    },
    reconnectingDot: {
      backgroundColor: colors.muted,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    notice: {
      color: colors.muted,
      fontSize: typography.caption,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
}

export function ChatComposer({
  wide,
  reconnecting,
  credentialConfigured,
  incompatibleError,
  imageError,
  error,
  children,
  onOpenKey,
}: ChatComposerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, wide), [colors, wide]);

  return (
    <View style={styles.root}>
      {reconnecting ? (
        <View style={styles.reconnecting}>
          <View style={styles.reconnectingDot} />
          <Copy small muted>
            Connection interrupted. Reconnecting…
          </Copy>
        </View>
      ) : null}
      {!credentialConfigured ? (
        <Button secondary onPress={onOpenKey}>
          Add your OpenRouter key to send a message
        </Button>
      ) : null}
      {incompatibleError ? <ErrorNotice error={incompatibleError} /> : null}
      {children}
      {imageError ? <ErrorNotice error={imageError} /> : null}
      <ErrorNotice error={error} />
      <Text style={styles.notice}>
        AI can make mistakes. Review external actions before confirming.
      </Text>
    </View>
  );
}
