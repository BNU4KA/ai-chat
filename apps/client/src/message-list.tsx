import {
  forwardRef,
  useMemo,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { spacing, useTheme, type ThemeColors } from './theme';
import { Button } from './ui';

interface MessageListProps {
  wide: boolean;
  atBottom: boolean;
  children: ReactNode;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: () => void;
  onJumpToLatest: () => void;
}

function createStyles(colors: ThemeColors, wide: boolean) {
  return StyleSheet.create({
    scroll: {
      backgroundColor: colors.background,
      flex: 1,
    },
    content: {
      alignSelf: 'center',
      gap: spacing.xl,
      maxWidth: 768,
      paddingBottom: spacing.xl,
      paddingHorizontal: wide ? spacing.xl : spacing.lg,
      paddingTop: spacing.lg,
      width: '100%',
    },
    jump: {
      alignSelf: 'center',
      bottom: spacing.sm,
      position: 'absolute',
      zIndex: 5,
    },
  });
}

export const MessageList = forwardRef<ComponentRef<typeof ScrollView>, MessageListProps>(
  function MessageList(
    {
      wide,
      atBottom,
      children,
      onScroll,
      onContentSizeChange,
      onJumpToLatest,
    },
    ref,
  ) {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors, wide), [colors, wide]);

    return (
      <View style={styles.scroll}>
        <ScrollView
          ref={ref}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          onScroll={onScroll}
          scrollEventThrottle={100}
          onContentSizeChange={onContentSizeChange}
        >
          {children}
        </ScrollView>
        {!atBottom ? (
          <View style={styles.jump}>
            <Button secondary onPress={onJumpToLatest}>
              Jump to latest ↓
            </Button>
          </View>
        ) : null}
      </View>
    );
  },
);
