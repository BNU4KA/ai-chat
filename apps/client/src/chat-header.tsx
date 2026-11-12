import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable, Text } from './locale-ui';
import { MenuMark } from './sidebar';
import { radii, spacing, typography, useTheme, type ThemeColors } from './theme';
import { Button, IconButton } from './ui';

interface ChatHeaderProps {
  wide: boolean;
  compactActions: boolean;
  title: string;
  avatar: string;
  onOpenSidebar: () => void;
  onWorkTools: () => void;
  onWorkspace: () => void;
  onSettings: () => void;
}

function createStyles(colors: ThemeColors, wide: boolean) {
  return StyleSheet.create({
    root: {
      alignItems: 'center',
      backgroundColor: colors.background,
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: 52,
      paddingHorizontal: wide ? spacing.xl : spacing.md,
      paddingVertical: spacing.sm,
    },
    titleGroup: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: colors.text,
      fontSize: typography.input,
      fontWeight: '600',
      lineHeight: 22,
    },
    avatar: {
      alignItems: 'center',
      backgroundColor: colors.text,
      borderRadius: radii.round,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    avatarText: {
      color: colors.background,
      fontSize: typography.body,
      fontWeight: '600',
    },
  });
}

export function ChatHeader({
  wide,
  compactActions,
  title,
  avatar,
  onOpenSidebar,
  onWorkTools,
  onWorkspace,
  onSettings,
}: ChatHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, wide), [colors, wide]);

  return (
    <View testID="chat-header" style={styles.root}>
      {!wide ? (
        <IconButton label="Open conversation history" onPress={onOpenSidebar}>
          <MenuMark color={colors.text} />
        </IconButton>
      ) : null}
      <View style={styles.titleGroup}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      {compactActions ? (
        <>
          <IconButton label="Work tools" onPress={onWorkTools}>
            ▣
          </IconButton>
          <IconButton label="Projects & tasks" onPress={onWorkspace}>
            ⧉
          </IconButton>
        </>
      ) : (
        <>
          <Button quiet label="Work tools" onPress={onWorkTools}>
            Work tools
          </Button>
          <Button quiet label="Projects & tasks" onPress={onWorkspace}>
            Projects & tasks
          </Button>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={onSettings}
        style={styles.avatar}
      >
        <Text translate={false} style={styles.avatarText}>
          {avatar}
        </Text>
      </Pressable>
    </View>
  );
}
