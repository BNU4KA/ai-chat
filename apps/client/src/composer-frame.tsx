import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { useTheme } from './theme';

export function ComposerFrame({
  focused,
  compact = false,
  children,
}: {
  focused: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  const { colors: c, isDark } = useTheme();
  return (
    <View
      testID="composer-frame"
      style={{
        borderWidth: 1,
        borderColor: isDark
          ? focused
            ? 'rgba(255, 255, 255, 0.2)'
            : 'rgba(255, 255, 255, 0.08)'
          : focused
            ? 'rgba(13, 13, 13, 0.22)'
            : 'rgba(13, 13, 13, 0.1)',
        borderRadius: 26,
        minHeight: compact ? 52 : undefined,
        backgroundColor: c.composer,
        paddingHorizontal: compact ? 10 : 14,
        paddingTop: compact ? 7 : 10,
        paddingBottom: compact ? 7 : 10,
        gap: compact ? 0 : 6,
        justifyContent: 'center',
        ...(Platform.OS === 'web'
          ? {
              boxShadow: isDark
                ? 'inset 0 0 1px 0 rgba(255, 255, 255, 0.12), 0 4px 24px rgba(0, 0, 0, 0.22)'
                : '0 0 0 1px rgba(0, 0, 0, 0.03), 0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 32px rgba(0, 0, 0, 0.04)',
            }
          : {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.24 : 0.06,
              shadowRadius: 12,
              elevation: 3,
            }),
      }}
    >
      {children}
    </View>
  );
}
