import { useRouter, useLocalSearchParams } from 'expo-router';
import { Button, Copy, Page } from '../../src/ui';
export default function IntegrationComplete() {
  const router = useRouter();
  const { connection } = useLocalSearchParams<{ connection?: string }>();
  return (
    <Page title="Google connection">
      <Copy>
        {connection === 'success'
          ? 'Google authorization was completed. Check the connected services in Settings.'
          : 'The connection could not be completed or consent was cancelled. Check Settings and try again.'}
      </Copy>
      <Button onPress={() => router.replace('/settings/connections')}>Check connection</Button>
    </Page>
  );
}
