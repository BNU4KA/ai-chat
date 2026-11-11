import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCredential } from '../../src/queries';
import { api, json } from '../../src/api';
import { Button, Copy, ErrorNotice, Field, Page, Panel, Loading } from '../../src/ui';
export default function KeyOnboarding() {
  const saved = useCredential();
  const cache = useQueryClient();
  const router = useRouter();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (saved.data?.configured) router.replace('/');
  }, [saved.data?.configured, router]);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(
        '/v1/credentials/openrouter',
        json('PUT', { api_key: key }, saved.data?.version ?? 0),
      );
      setKey('');
      await cache.invalidateQueries({ queryKey: ['credential'] });
      router.replace('/');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (saved.isPending) return <Loading />;
  return (
    <Page title="Connect your model key">
      <Panel>
        <Copy>
          Use your own OpenRouter balance. Your key is encrypted on the server so tasks can continue
          when you close the app.
        </Copy>
        <Field
          accessibilityLabel="OpenRouter API key"
          placeholder="OpenRouter API key"
          value={key}
          onChangeText={setKey}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button secondary onPress={() => setShow(!show)}>
          {show ? 'Hide key' : 'Show key'}
        </Button>
        <ErrorNotice error={error ?? saved.error} />
        <Button disabled={busy || !key.trim()} onPress={() => void save()}>
          {busy ? 'Validating…' : 'Save and continue'}
        </Button>
        <Button secondary onPress={() => router.replace('/')}>
          Skip for now
        </Button>
      </Panel>
    </Page>
  );
}
