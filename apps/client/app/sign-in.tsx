import { Text } from '../src/locale-ui';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth';
import { radii, spacing, typography, useTheme, type ThemeColors } from '../src/theme';
import { Button, Copy, ErrorNotice } from '../src/ui';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    content: {
      alignItems: 'center',
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    card: {
      alignItems: 'center',
      gap: spacing.xl,
      maxWidth: 420,
      width: '100%',
    },
    brand: {
      alignItems: 'center',
      gap: spacing.md,
    },
    mark: {
      alignItems: 'center',
      backgroundColor: colors.text,
      borderRadius: radii.md,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    markText: {
      color: colors.background,
      fontSize: typography.title,
      fontWeight: '700',
    },
    title: {
      color: colors.text,
      fontSize: typography.display,
      fontWeight: '600',
      lineHeight: 36,
      textAlign: 'center',
    },
    subtitle: {
      maxWidth: 360,
      textAlign: 'center',
    },
    actions: {
      gap: spacing.md,
      width: '100%',
    },
    privacy: {
      color: colors.quiet,
      fontSize: typography.caption,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
}

export default function SignInScreen() {
  const { signIn, configured } = useAuth();
  const { colors: c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const styles = useMemo(() => createStyles(c), [c]);

  const login = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [signIn]);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text translate={false} style={styles.markText}>
                AI
              </Text>
            </View>
            <Text style={styles.title}>Welcome to AI Chat</Text>
            <Copy muted>
              <Text style={styles.subtitle}>
                Sign in to continue to your conversations, models, and connected tools.
              </Text>
            </Copy>
          </View>
          <View style={styles.actions}>
            <Button
              disabled={busy || !configured}
              onPress={() => void login()}
            >
              {busy ? 'Connecting…' : 'Continue with Google'}
            </Button>
            <ErrorNotice error={error} />
            {!configured && (
              <Copy muted small>
                Sign-in is not available yet. Please contact the service owner.
              </Copy>
            )}
          </View>
          <Text style={styles.privacy}>
            Google sign-in only identifies your account. Gmail and Calendar access are requested
            separately when you connect those tools.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
