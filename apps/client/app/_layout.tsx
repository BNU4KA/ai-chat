import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter, useRootNavigationState, type Href } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { AuthProvider, useAuth } from '../src/auth';
import { ThemeProvider, useTheme } from '../src/theme';
import { Loading } from '../src/ui';
import { ToastHost } from '../src/toast';
import { LocaleProvider } from '../src/locale';
import { WebEffects } from '../src/web-effects';
import { useProfile } from '../src/queries';
import { rememberReturnPath, consumeReturnPath } from '../src/return-path';
import { useVisualViewportFrame } from '../src/visual-viewport';

void SplashScreen.preventAutoHideAsync();

const SPLASH_TIMEOUT_MS = 3000;

function Navigation() {
  const { session, ready } = useAuth();
  const path = usePathname();
  const { colors, isDark, ready: themeReady, setChoice } = useTheme();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const profile = useProfile(!!session);
  const isPublic = path === '/sign-in' || path === '/auth/callback';
  const profileSettled = !session || !profile.isPending;
  const launchReady = themeReady && ready && profileSettled;
  const profileTheme = profile.data?.theme;
  useVisualViewportFrame();

  useEffect(() => {
    if (profileTheme) setChoice(profileTheme);
  }, [profileTheme, setChoice]);
  useEffect(() => {
    if (launchReady) void SplashScreen.hideAsync();
  }, [launchReady]);
  useEffect(() => {
    const timer = setTimeout(() => void SplashScreen.hideAsync(), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);
  useEffect(() => {
    const s = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    return () => s.remove();
  }, []);
  useEffect(() => {
    if (!ready || !navigation?.key) return;
    if (!session && !isPublic) {
      rememberReturnPath(path);
      router.replace('/sign-in');
    } else if (session && path === '/sign-in') router.replace((consumeReturnPath() ?? '/') as Href);
  }, [ready, session, isPublic, path, router, navigation?.key]);
  return (
    <SafeAreaProvider>
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <WebEffects />
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          key={session?.user.id ?? 'anonymous'}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: Platform.OS === 'web' ? 'none' : 'default',
          }}
        />
        <ToastHost />
        {themeReady && (!ready || (!session && !isPublic)) && (
          <View style={StyleSheet.absoluteFill}>
            <Loading />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 3000, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <GestureHandlerRootView style={styles.fill}>
      <KeyboardProvider>
        <QueryClientProvider client={cache}>
          <ThemeProvider>
            <AuthProvider>
              <LocaleProvider>
                <Navigation />
              </LocaleProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
