import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing, useTheme, type ThemeColors } from './theme';

interface ComposerFrameProps {
  focused: boolean;
  children: ReactNode;
}

function createStyles(colors: ThemeColors, focused: boolean) {
  return StyleSheet.create({
    frame: {
      backgroundColor: colors.composer,
      borderColor: focused ? colors.text : colors.border,
      borderRadius: 28,
      borderWidth: 1,
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: focused ? 0.1 : 0.06,
      shadowRadius: focused ? 10 : 6,
      elevation: focused ? 3 : 1,
    },
  });
}

export function ComposerFrame({ focused, children }: ComposerFrameProps) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c, focused), [c, focused]);

  return (
    <View testID="composer-frame" style={styles.frame}>
      {children}
    </View>
  );
}
