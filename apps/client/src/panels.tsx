import { useLocalSearchParams, useRouter } from 'expo-router';
import { SettingsScreen } from '../app/settings';
import { ConnectionsScreen } from '../app/settings/connections';
import { DataScreen } from '../app/settings/data';
import { KeyScreen } from '../app/onboarding/key';
import { Dialog } from './dialog';
import { WorkspacePage } from './workspace';

const titles: Record<string, string> = {
  settings: 'Settings',
  connections: 'Google connections',
  data: 'Data & account',
  key: 'Connect your model key',
  workspace: 'Workspace',
};
const help: Record<string, string> = {
  settings: 'Account, language, model key, connections, appearance, and stored data.',
  connections:
    'Google sign-in and access to your mail or calendar are separate. The agent still asks before it sends mail or changes the calendar.',
  data: 'Conversations, documents, and tool results are stored on the server so they sync across devices. You can delete the account from this screen.',
  key: 'Use your own OpenRouter balance. Your key is encrypted on the server so tasks can continue when you close the app.',
  workspace:
    'Projects, documents, message search, scheduled tasks, and notifications. A project note is used only in chats you attach to that project.',
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function Panels() {
  const router = useRouter();
  const params = useLocalSearchParams<{ panel?: string | string[] }>();
  const panel = one(params.panel) ?? '';
  const title = titles[panel];
  if (!title) return null;
  return (
    <Dialog
      title={title}
      help={help[panel]}
      visible
      wide={panel === 'workspace'}
      close={() => router.setParams({ panel: '', document: '' })}
    >
      {panel === 'settings' && <SettingsScreen />}
      {panel === 'connections' && <ConnectionsScreen />}
      {panel === 'data' && <DataScreen />}
      {panel === 'key' && <KeyScreen />}
      {panel === 'workspace' && <WorkspacePage />}
    </Dialog>
  );
}
