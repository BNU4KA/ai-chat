import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from '../src/locale-ui';
import { useTheme } from '../src/theme';
import {
  assignAdminKey,
  createAdminKey,
  deleteAdminKey,
  deleteAdminUser,
  useAdminKeys,
  useAdminUsers,
  useProfile,
  type AdminKey,
  type AdminUser,
} from '../src/queries';
import { Button, Copy, ErrorNotice, Field, Loading, Page, Panel } from '../src/ui';

type AdminTab = 'keys' | 'users';
type AdminStyles = {
  tabs: ViewStyle;
  card: ViewStyle;
  row: ViewStyle;
  title: TextStyle;
  meta: TextStyle;
  stack: ViewStyle;
};

function useAdminStyles(): AdminStyles {
  const { colors: c } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        card: {
          padding: 14,
          gap: 8,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          backgroundColor: c.raised,
        },
        row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
        title: { color: c.text, fontSize: 16, fontWeight: '600' },
        meta: { color: c.muted, fontSize: 13 },
        stack: { gap: 12 },
      }),
    [c],
  );
}

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminScreen() {
  const profile = useProfile();
  const admin = Boolean(profile.data?.is_admin);
  const styles = useAdminStyles();
  const [tab, setTab] = useState<AdminTab>('keys');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const busy = action !== null;
  const [error, setError] = useState<unknown>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<string | null>(null);
  const keys = useAdminKeys(admin);
  const users = useAdminUsers(search.trim(), admin && tab === 'users');

  const refresh = useCallback(async () => {
    await Promise.all([keys.refetch(), users.refetch()]);
  }, [keys, users]);

  const saveKey = useCallback(async () => {
    setAction('save');
    setError(null);
    try {
      await createAdminKey(label.trim(), apiKey.trim());
      setLabel('');
      setApiKey('');
      await keys.refetch();
    } catch (caught) {
      setError(caught);
    } finally {
      setAction(null);
    }
  }, [apiKey, keys, label]);

  const removeKey = useCallback(
    async (id: string) => {
      setAction('delete-key');
      setError(null);
      try {
        await deleteAdminKey(id);
        setConfirmKey(null);
        await refresh();
      } catch (caught) {
        setError(caught);
      } finally {
        setAction(null);
      }
    },
    [refresh],
  );

  const assign = useCallback(
    async (userId: string, managedKeyId: string | null) => {
      setAction('assign');
      setError(null);
      try {
        await assignAdminKey(userId, managedKeyId);
        await users.refetch();
      } catch (caught) {
        setError(caught);
      } finally {
        setAction(null);
      }
    },
    [users],
  );

  const removeUser = useCallback(
    async (id: string) => {
      setAction('delete-user');
      setError(null);
      try {
        await deleteAdminUser(id);
        setConfirmUser(null);
        await users.refetch();
      } catch (caught) {
        setError(caught);
      } finally {
        setAction(null);
      }
    },
    [users],
  );

  if (profile.isPending) return <Loading />;
  if (!admin) {
    return (
      <Page title="Admin Panel">
        <Copy>You do not have access to the admin panel.</Copy>
      </Page>
    );
  }

  return (
    <Page title="Admin Panel">
      <View style={styles.tabs}>
        <Button secondary={tab !== 'keys'} onPress={() => setTab('keys')}>
          OpenRouter keys
        </Button>
        <Button secondary={tab !== 'users'} onPress={() => setTab('users')}>
          Users
        </Button>
      </View>
      <ErrorNotice error={error ?? (tab === 'keys' ? keys.error : users.error)} />
      {tab === 'keys' ? (
        <View style={styles.stack}>
          <Panel>
            <Field
              accessibilityLabel="Key label"
              placeholder="Key label"
              value={label}
              onChangeText={setLabel}
              autoCapitalize="none"
            />
            <Field
              accessibilityLabel="Server API key"
              placeholder="Server API key"
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.row}>
              <Button disabled={busy || !label.trim() || !apiKey.trim()} onPress={() => void saveKey()}>
                {action === 'save' ? 'Validating…' : 'Save server key'}
              </Button>
            </View>
          </Panel>
          {(keys.data ?? []).map((key) => (
            <KeyCard
              key={key.id}
              item={key}
              busy={busy}
              confirm={confirmKey === key.id}
              styles={styles}
              onConfirm={() => setConfirmKey(key.id)}
              onCancel={() => setConfirmKey(null)}
              onDelete={() => void removeKey(key.id)}
            />
          ))}
          {keys.data?.length === 0 && <Copy>No server keys yet.</Copy>}
        </View>
      ) : (
        <View style={styles.stack}>
          <Field
            accessibilityLabel="Search by name or email"
            placeholder="Search by name or email"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {(users.data ?? []).map((user) => (
            <UserCard
              key={user.id}
              user={user}
              self={user.id === profile.data?.id}
              keys={keys.data ?? []}
              busy={busy}
              confirm={confirmUser === user.id}
              styles={styles}
              onAssign={(managedKeyId) => void assign(user.id, managedKeyId)}
              onConfirm={() => setConfirmUser(user.id)}
              onCancel={() => setConfirmUser(null)}
              onDelete={() => void removeUser(user.id)}
            />
          ))}
          {users.data?.length === 0 && <Copy>No users match this search.</Copy>}
        </View>
      )}
    </Page>
  );
}

function KeyCard({
  item,
  busy,
  confirm,
  styles,
  onConfirm,
  onCancel,
  onDelete,
}: {
  item: AdminKey;
  busy: boolean;
  confirm: boolean;
  styles: Pick<AdminStyles, 'card' | 'row' | 'title' | 'meta'>;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title} translate={false}>
        {item.label}
      </Text>
      <Text style={styles.meta} translate={false}>{`••••${item.last_four}`}</Text>
      <Text style={styles.meta} translate={false}>
        {`${when(item.validated_at)} · ${item.assigned_users_count}`}
      </Text>
      <Text style={styles.meta}>Assigned users</Text>
      <View style={styles.row}>
        {confirm ? (
          <>
            <Button danger disabled={busy} onPress={onDelete}>
              Confirm delete
            </Button>
            <Button secondary disabled={busy} onPress={onCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <Button secondary disabled={busy} onPress={onConfirm}>
            Delete key
          </Button>
        )}
      </View>
    </View>
  );
}

function UserCard({
  user,
  self,
  keys,
  busy,
  confirm,
  styles,
  onAssign,
  onConfirm,
  onCancel,
  onDelete,
}: {
  user: AdminUser;
  self: boolean;
  keys: AdminKey[];
  busy: boolean;
  confirm: boolean;
  styles: Pick<AdminStyles, 'card' | 'row' | 'title' | 'meta'>;
  onAssign: (managedKeyId: string | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title} translate={false}>
        {user.display_name || user.email || user.id}
      </Text>
      {user.email && (
        <Text style={styles.meta} translate={false}>
          {user.email}
        </Text>
      )}
      <Text style={styles.meta} translate={false}>
        {when(user.created_at)}
      </Text>
      <Text style={styles.meta} translate={false}>{`${user.conversations_count}`}</Text>
      <Text style={styles.meta}>Chats</Text>
      <Text style={styles.meta} translate={false}>{`$${user.total_cost_usd}`}</Text>
      <Text style={styles.meta}>Recorded spend</Text>
      {user.key_source === 'personal' && <Text>Personal key</Text>}
      {user.key_source === 'managed' && <Text>Server key</Text>}
      {user.key_source === 'managed' && (
        <Text style={styles.meta} translate={false}>
          {user.managed_key?.label ?? ''}
        </Text>
      )}
      {user.key_source === 'missing' && <Text>No key</Text>}
      {user.has_personal_key && <Copy small muted>Personal key has priority over the server key.</Copy>}
      <View style={styles.row}>
        <Button
          secondary
          disabled={busy || user.managed_key == null}
          onPress={() => onAssign(null)}
        >
          None
        </Button>
        {keys.map((key) => (
          <Button
            key={key.id}
            secondary={user.managed_key?.id !== key.id}
            disabled={busy}
            onPress={() => onAssign(key.id)}
          >
            {key.label}
          </Button>
        ))}
      </View>
      {!self && (
        <View style={styles.row}>
          {confirm ? (
            <>
              <Button danger disabled={busy} onPress={onDelete}>
                Confirm delete
              </Button>
              <Button secondary disabled={busy} onPress={onCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <Button danger disabled={busy} onPress={onConfirm}>
              Delete user
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
