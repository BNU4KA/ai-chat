import { useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { consumeReturnPath } from '../../src/return-path';
import { Platform } from 'react-native';
import { supabase } from '../../src/supabase';
import { Loading, Page, ErrorNotice, Button } from '../../src/ui';
let exchange: { code: string; promise: Promise<void> } | null = null;
export default function Callback() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !supabase) {
      setError(new Error('This sign-in link is not available.'));
      return;
    }
    const code = new URL(window.location.href).searchParams.get('code');
    if (!code) {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) router.replace('/');
        else setError(new Error('The sign-in link expired. Please try again.'));
      });
      return;
    }
    if (exchange?.code !== code)
      exchange = {
        code,
        promise: (async () => {
          const result = await supabase!.auth.exchangeCodeForSession(code);
          window.history.replaceState({}, '', '/auth/callback');
          if (result.error) throw new Error('Sign-in could not be completed. Please try again.');
        })(),
      };
    void exchange.promise
      .then(() => router.replace((consumeReturnPath() ?? '/onboarding/key') as Href))
      .catch(setError);
  }, [router]);
  return error ? (
    <Page title="Sign in">
      <ErrorNotice error={error} />
      <Button
        onPress={() => {
          exchange = null;
          router.replace('/sign-in');
        }}
      >
        Back to sign in
      </Button>
    </Page>
  ) : (
    <Loading />
  );
}
