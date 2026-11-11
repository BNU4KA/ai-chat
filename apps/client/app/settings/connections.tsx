import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, json } from '../../src/api';
import { Button, Copy, ErrorNotice, Page, Panel } from '../../src/ui';
import type { Integration } from '../../src/types';
export default function Connections() {
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: ['integration'],
    queryFn: () => api<Integration>('/v1/integrations/google'),
    refetchInterval: 5000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function connect(capability: 'gmail' | 'calendar') {
    setBusy(true);
    setError(null);
    try {
      const value = await api<{ authorization_url: string }>(
        '/v1/integrations/google/connect',
        json('POST', { capability, return_target: Platform.OS === 'web' ? 'web' : 'native' }),
      );
      if (Platform.OS === 'web') window.location.assign(value.authorization_url);
      else await Linking.openURL(value.authorization_url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(capability: 'gmail' | 'calendar') {
    try {
      await api(
        `/v1/integrations/google/capabilities/${capability}`,
        json('DELETE', undefined, status.data?.version),
      );
      await cache.invalidateQueries({ queryKey: ['integration'] });
      await cache.invalidateQueries({ queryKey: ['capabilities'] });
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Page title="Google connections">
      <Copy>
        Connect only the services you want the agent to use. Writes require a separate confirmation
        in the chat.
      </Copy>
      <ErrorNotice error={error ?? status.error} />
      {status.data?.account_email && <Copy>Connected account: {status.data.account_email}</Copy>}
      {(['gmail', 'calendar'] as const).map((capability) => (
        <Panel key={capability}>
          <Copy>{capability === 'gmail' ? 'Gmail' : 'Google Calendar'}</Copy>
          <Copy small muted>
            {capability === 'gmail'
              ? 'Search and read messages, prepare drafts, and send approved plain-text emails.'
              : 'Read primary-calendar events, check availability, and create or update approved events.'}
          </Copy>
          <Copy small>
            {status.data?.capabilities[capability]
              ? status.data.status === 'reauth_required'
                ? 'Authorization expired — reconnect'
                : 'Connected'
              : 'Not connected'}
          </Copy>
          {status.data?.capabilities[capability] && (
            <Button secondary onPress={() => void disconnect(capability)}>
              Disconnect and stop related tasks
            </Button>
          )}
          <Button disabled={busy} onPress={() => void connect(capability)}>
            {status.data?.capabilities[capability] ? 'Reconnect' : 'Connect'}
          </Button>
        </Panel>
      ))}
      <Copy small muted>
        Disconnecting stops new actions immediately. Already submitted operations may finish. When
        the last service is disconnected, the server also attempts to revoke its Google grant.
      </Copy>
    </Page>
  );
}
