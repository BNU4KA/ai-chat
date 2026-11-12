import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import { useProfile } from '../../src/queries';
import { api, json } from '../../src/api';
import { Button, Copy, ErrorNotice, Field, PanelRedirect } from '../../src/ui';
import { Section } from '../../src/dialog';
export function DataScreen() {
  const router = useRouter();
  const auth = useAuth();
  const profile = useProfile();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function remove() {
    if (!profile.data) return;
    setBusy(true);
    try {
      await api('/v1/account', json('DELETE', { confirmation: 'DELETE' }, profile.data.version));
      await auth.signOut();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Button quiet onPress={() => router.setParams({ panel: 'settings' })}>
        ← Back
      </Button>
      <Section
        title="Stored data"
        help="Conversations, documents, and tool results are stored on the server to sync across devices. Keys and integration credentials are encrypted."
      >
        <Copy muted>
          Conversations, documents, and tool results are stored on the server to sync across
          devices. Keys and integration credentials are encrypted. Relevant content is sent to the
          model and tools used by your requests.
        </Copy>
        <Copy muted>
          Delete a conversation from its Tools menu to remove that chat and its documents. Deleting
          a document removes the original and retrieval index; existing answers can still quote it
          until the conversation is deleted.
        </Copy>
      </Section>
      <Section
        title="Delete your account"
        help="Access is disabled immediately and running tasks are stopped. The server removes your stored data and attempts Google revocation. Upload-token expiry can delay physical cleanup for up to two hours; provider outages can extend revocation retries up to 24 hours. Backups expire within 30 days and operational logs within 14 days under the deployment policy."
      >
        <Copy muted>
          Access is disabled immediately and running tasks are stopped. The server removes your
          stored data and attempts Google revocation. Upload-token expiry can delay physical cleanup
          for up to two hours; provider outages can extend revocation retries up to 24 hours.
          Backups expire within 30 days and operational logs within 14 days under the deployment
          policy.
        </Copy>
        <Copy muted>
          Sent emails, calendar changes, and provider-retained data are not undone by deleting the
          account.
        </Copy>
        <Field
          accessibilityLabel="Type DELETE to confirm account deletion"
          placeholder="Type DELETE to confirm"
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
        />
        <ErrorNotice error={error} />
        <Button danger disabled={busy || confirmation !== 'DELETE'} onPress={() => void remove()}>
          {busy ? 'Deleting…' : 'Permanently delete account'}
        </Button>
      </Section>
    </View>
  );
}
export default function DataRoute() {
  return <PanelRedirect panel="data" />;
}
