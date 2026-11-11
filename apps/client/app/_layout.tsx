import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Stack, usePathname, useRouter, useRootNavigationState, type Href } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth';
import { ThemeProvider, useTheme } from '../src/theme';
import { Loading } from '../src/ui';
import { LocaleProvider } from '../src/locale';
import { WebEffects } from '../src/web-effects';
import { rememberReturnPath, consumeReturnPath } from '../src/return-path';
function Navigation() {
  const { session, ready } = useAuth();
  const path = usePathname();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const isPublic = path === '/sign-in' || path === '/auth/callback';
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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
        {(!ready || (!session && !isPublic)) && (
          <View style={{ position: 'absolute', inset: 0 }}>
            <Loading />
          </View>
        )}
      </SafeAreaView>
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
    <QueryClientProvider client={cache}>
      <ThemeProvider>
        <AuthProvider>
          <LocaleProvider>
            <Navigation />
          </LocaleProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
