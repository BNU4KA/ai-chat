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
