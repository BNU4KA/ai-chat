import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { ChatGptIcon, type ChatGptIconName } from '../src/chatgpt-icons';
import { Pressable, Text } from '../src/locale-ui';
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
import { Button, Copy, ErrorNotice, Field, Loading, Page } from '../src/ui';

type AdminTab = 'keys' | 'users';
type KeyPriority = 'personal' | 'server';
type AdminStyles = {
  shell: ViewStyle;
  navShift: ViewStyle;
  nav: ViewStyle;
  navItem: ViewStyle;
  main: ViewStyle;
  navText: TextStyle;
  navTextOn: TextStyle;
  stack: ViewStyle;
  row: ViewStyle;
  scroller: ViewStyle;
  tableKeys: ViewStyle;
  tableUsers: ViewStyle;
  head: ViewStyle;
  line: ViewStyle;
  cell: ViewStyle;
  colLabel: ViewStyle;
  colSecret: ViewStyle;
  colChecked: ViewStyle;
  colUsed: ViewStyle;
  colKeyActions: ViewStyle;
  colUser: ViewStyle;
  colJoined: ViewStyle;
  colChats: ViewStyle;
  colSpend: ViewStyle;
  colFlag: ViewStyle;
  colServer: ViewStyle;
  colPriority: ViewStyle;
  colUserActions: ViewStyle;
  actionRow: ViewStyle;
  actionStack: ViewStyle;
  title: TextStyle;
  headText: TextStyle;
  cellText: TextStyle;
  backdrop: ViewStyle;
  dialog: ViewStyle;
  who: TextStyle;
  section: ViewStyle;
  options: ViewStyle;
  segment: ViewStyle;
  option: ViewStyle;
  optionFill: ViewStyle;
  optionOn: ViewStyle;
  optionSolid: ViewStyle;
  optionText: TextStyle;
  optionTextSolid: TextStyle;
  optionDisabled: ViewStyle;
  footer: ViewStyle;
  help: TextStyle;
};

function useAdminStyles(): AdminStyles {
  const { colors: c, isDark } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        shell: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
        navShift: { paddingTop: 28 },
        nav: {
          width: 200,
          gap: 2,
          paddingRight: 10,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: c.border,
        },
        navItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 38,
          paddingHorizontal: 10,
          borderRadius: 8,
        },
        main: { flex: 1, minWidth: 0, gap: 12 },
        navText: { fontSize: 14, color: c.muted },
        navTextOn: { fontSize: 14, fontWeight: '500', color: c.text },
        stack: { gap: 12 },
        row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
        scroller: { width: '100%' },
        tableKeys: {
          width: 1128,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          overflow: 'hidden',
        },
        tableUsers: {
          width: 1128,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          overflow: 'hidden',
        },
        head: {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 40,
          borderBottomWidth: 1,
          borderColor: c.border,
          backgroundColor: c.raised,
        },
        line: {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          borderBottomWidth: 1,
          borderColor: c.border,
        },
        cell: { paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center' },
        colLabel: { width: 320, flexGrow: 0, flexShrink: 0 },
        colSecret: { width: 190, flexGrow: 0, flexShrink: 0 },
        colChecked: { width: 190, flexGrow: 0, flexShrink: 0 },
        colUsed: { width: 168, flexGrow: 0, flexShrink: 0 },
        colKeyActions: { width: 260, flexGrow: 0, flexShrink: 0 },
        colUser: { width: 236, flexGrow: 0, flexShrink: 0 },
        colJoined: { width: 156, flexGrow: 0, flexShrink: 0 },
        colChats: { width: 72, flexGrow: 0, flexShrink: 0 },
        colSpend: { width: 128, flexGrow: 0, flexShrink: 0 },
        colFlag: { width: 96, flexGrow: 0, flexShrink: 0 },
        colServer: { width: 148, flexGrow: 0, flexShrink: 0 },
        colPriority: { width: 108, flexGrow: 0, flexShrink: 0 },
        colUserActions: { width: 184, flexGrow: 0, flexShrink: 0 },
        actionRow: {
          flexDirection: 'row',
          flexWrap: 'nowrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'flex-end',
        },
        actionStack: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
        title: { color: c.text, fontSize: 16, fontWeight: '600' },
        headText: { color: c.muted, fontSize: 12, fontWeight: '600' },
        cellText: { color: c.text, fontSize: 13 },
        backdrop: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)',
        },
        dialog: {
          width: '100%',
          maxWidth: 440,
          gap: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 16,
          backgroundColor: c.raised,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.4,
          shadowRadius: 32,
          elevation: 12,
        },
        who: { color: c.muted, fontSize: 13 },
        section: { gap: 8 },
        options: { gap: 8 },
        segment: { flexDirection: 'row', gap: 8 },
        option: {
          minHeight: 42,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        optionFill: { flex: 1, justifyContent: 'center' },
        optionOn: { borderColor: c.text },
        optionSolid: { backgroundColor: c.accent, borderColor: c.accent },
        optionText: { color: c.text, fontSize: 14 },
        optionTextSolid: { color: c.accentText, fontSize: 14, fontWeight: '600' },
        optionDisabled: { opacity: 0.45 },
        footer: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: c.border,
        },
        help: { color: c.muted, fontSize: 13, lineHeight: 18 },
      }),
    [c, isDark],
  );
}

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface CellProps {
  children: ReactNode;
  box: ViewStyle[];
  text: TextStyle;
  literal?: boolean;
}

function Cell({ children, box, text, literal = false }: CellProps) {
  return (
    <View style={box}>
      {typeof children === 'string' ? (
        <Text style={text} translate={!literal} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

interface DialogProps {
  title: string;
  visible: boolean;
  testID: string;
  onClose: () => void;
  children: ReactNode;
}

function AdminDialog({ title, visible, testID, onClose, children }: DialogProps) {
  const styles = useAdminStyles();
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, visible]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View testID={testID} style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export default function AdminScreen() {
  const profile = useProfile();
  const admin = Boolean(profile.data?.is_admin);
  const styles = useAdminStyles();
  const [tab, setTab] = useState<AdminTab>('keys');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyOpen, setKeyOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const busy = action !== null;
  const [error, setError] = useState<unknown>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<string | null>(null);
  const [assignUser, setAssignUser] = useState<AdminUser | null>(null);
  const [draftKeyId, setDraftKeyId] = useState<string | null>(null);
  const [draftPriority, setDraftPriority] = useState<KeyPriority>('personal');
  const keys = useAdminKeys(admin);
  const users = useAdminUsers(search.trim(), admin && tab === 'users');

  const refresh = useCallback(async () => {
    await Promise.all([keys.refetch(), users.refetch()]);
  }, [keys, users]);

  const openKeyDialog = useCallback(() => {
    setLabel('');
    setApiKey('');
    setError(null);
    setKeyOpen(true);
  }, []);

  const saveKey = useCallback(async () => {
    setAction('save');
    setError(null);
    try {
      await createAdminKey(label.trim(), apiKey.trim());
      setLabel('');
      setApiKey('');
      setKeyOpen(false);
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

  const openAssign = useCallback((user: AdminUser) => {
    setAssignUser(user);
    setDraftKeyId(user.managed_key?.id ?? null);
    setDraftPriority(user.key_priority);
    setError(null);
  }, []);

  const saveAssign = useCallback(async () => {
    if (!assignUser) return;
    setAction('assign');
    setError(null);
    try {
      await assignAdminKey(assignUser.id, draftKeyId, draftPriority);
      setAssignUser(null);
      await users.refetch();
    } catch (caught) {
      setError(caught);
    } finally {
      setAction(null);
    }
  }, [assignUser, draftKeyId, draftPriority, users]);

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

  const showKeys = useCallback(() => setTab('keys'), []);
  const showUsers = useCallback(() => setTab('users'), []);
  const closeKeyDialog = useCallback(() => setKeyOpen(false), []);
  const closeAssign = useCallback(() => setAssignUser(null), []);
  const choosePersonal = useCallback(() => setDraftPriority('personal'), []);
  const chooseServer = useCallback(() => setDraftPriority('server'), []);
  const chooseNoKey = useCallback(() => setDraftKeyId(null), []);
  const pressSaveKey = useCallback(() => {
    void saveKey();
  }, [saveKey]);
  const pressSaveAssign = useCallback(() => {
    void saveAssign();
  }, [saveAssign]);

  if (profile.isPending) return <Loading />;
  if (!admin) {
    return (
      <Page title="Admin Panel">
        <Copy>You do not have access to the admin panel.</Copy>
      </Page>
    );
  }

  return (
    <Page title="Admin Panel" wide>
      <View style={styles.shell}>
        <View style={styles.navShift}>
        <View style={styles.nav}>
          <NavItem
            label="OpenRouter keys"
            icon="sliders"
            active={tab === 'keys'}
            styles={styles}
            onPress={showKeys}
          />
          <NavItem
            label="Users"
            icon="projects"
            active={tab === 'users'}
            styles={styles}
            onPress={showUsers}
          />
        </View>
        </View>
        <View style={styles.main}>
      <ErrorNotice error={error ?? (tab === 'keys' ? keys.error : users.error)} />
      {tab === 'keys' ? (
        <View style={styles.stack}>
          <View style={styles.row}>
            <Button onPress={openKeyDialog}>Add server key</Button>
          </View>
          <ScrollView horizontal style={styles.scroller}>
            <View style={styles.tableKeys}>
              <View style={styles.head}>
                <Cell box={[styles.cell, styles.colLabel]} text={styles.headText}>
                  Label
                </Cell>
                <Cell box={[styles.cell, styles.colSecret]} text={styles.headText}>
                  Server key
                </Cell>
                <Cell box={[styles.cell, styles.colChecked]} text={styles.headText}>
                  Checked
                </Cell>
                <Cell box={[styles.cell, styles.colUsed]} text={styles.headText}>
                  Users
                </Cell>
                <Cell box={[styles.cell, styles.colKeyActions]} text={styles.headText}>
                  {''}
                </Cell>
              </View>
              {(keys.data ?? []).map((key) => (
                <KeyRow
                  key={key.id}
                  item={key}
                  busy={busy}
                  confirm={confirmKey === key.id}
                  styles={styles}
                  onConfirm={setConfirmKey}
                  onCancel={setConfirmKey}
                  onDelete={removeKey}
                />
              ))}
            </View>
          </ScrollView>
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
          <ScrollView horizontal style={styles.scroller}>
            <View style={styles.tableUsers}>
              <View style={styles.head}>
                <Cell box={[styles.cell, styles.colUser]} text={styles.headText}>
                  User
                </Cell>
                <Cell box={[styles.cell, styles.colJoined]} text={styles.headText}>
                  Joined
                </Cell>
                <Cell box={[styles.cell, styles.colChats]} text={styles.headText}>
                  Chats
                </Cell>
                <Cell box={[styles.cell, styles.colSpend]} text={styles.headText}>
                  Spend
                </Cell>
                <Cell box={[styles.cell, styles.colFlag]} text={styles.headText}>
                  Personal
                </Cell>
                <Cell box={[styles.cell, styles.colServer]} text={styles.headText}>
                  Server
                </Cell>
                <Cell box={[styles.cell, styles.colPriority]} text={styles.headText}>
                  Priority
                </Cell>
                <Cell box={[styles.cell, styles.colUserActions]} text={styles.headText}>
                  {''}
                </Cell>
              </View>
              {(users.data ?? []).map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  self={user.id === profile.data?.id}
                  busy={busy}
                  confirm={confirmUser === user.id}
                  styles={styles}
                  onAssign={openAssign}
                  onConfirm={setConfirmUser}
                  onCancel={setConfirmUser}
                  onDelete={removeUser}
                />
              ))}
            </View>
          </ScrollView>
          {users.data?.length === 0 && <Copy>No users match this search.</Copy>}
        </View>
      )}
        </View>
      </View>
      <AdminDialog title="Add server key" visible={keyOpen} testID="add-key-dialog" onClose={closeKeyDialog}>
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
        <ErrorNotice error={keyOpen ? error : null} />
        <View style={styles.footer}>
          <Button secondary disabled={busy} onPress={closeKeyDialog}>
            Cancel
          </Button>
          <Button disabled={busy || !label.trim() || !apiKey.trim()} onPress={pressSaveKey}>
            {action === 'save' ? 'Validating…' : 'Save'}
          </Button>
        </View>
      </AdminDialog>
      <AdminDialog
        title="Assign key"
        visible={assignUser != null}
        testID="assign-key-dialog"
        onClose={closeAssign}
      >
        <Text style={styles.who} translate={false}>
          {assignUser?.display_name || assignUser?.email || ''}
        </Text>
        <View style={styles.section}>
          <Text style={styles.headText}>Server key</Text>
          <View style={styles.options}>
            <Option
              label="None"
              selected={draftKeyId == null}
              disabled={busy}
              styles={styles}
              onPress={chooseNoKey}
            />
            {(keys.data ?? []).map((key) => (
              <KeyChoice
                key={key.id}
                item={key}
                selected={draftKeyId === key.id}
                disabled={busy}
                styles={styles}
                onChoose={setDraftKeyId}
              />
            ))}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.headText}>Priority</Text>
          <View style={styles.segment}>
            <Option
              label="Personal"
              solid
              fill
              selected={draftPriority === 'personal'}
              disabled={busy}
              styles={styles}
              onPress={choosePersonal}
            />
            <Option
              label="Server"
              solid
              fill
              selected={draftPriority === 'server'}
              disabled={busy}
              styles={styles}
              onPress={chooseServer}
            />
          </View>
          <Text style={styles.help}>
            Server priority uses the assigned server key. Otherwise a personal key is used first.
          </Text>
        </View>
        <ErrorNotice error={assignUser ? error : null} />
        <View style={styles.footer}>
          <Button secondary disabled={busy} onPress={closeAssign}>
            Cancel
          </Button>
          <Button disabled={busy} onPress={pressSaveAssign}>
            Save
          </Button>
        </View>
      </AdminDialog>
    </Page>
  );
}

interface NavItemProps {
  label: string;
  icon: ChatGptIconName;
  active: boolean;
  styles: AdminStyles;
  onPress: () => void;
}

function NavItem({ label, icon, active, styles, onPress }: NavItemProps) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ hovered }) => [
        styles.navItem,
        { backgroundColor: active ? c.selected : hovered ? c.hover : 'transparent' },
      ]}
    >
      <ChatGptIcon name={icon} size={16} color={active ? c.text : c.muted} />
      <Text style={active ? styles.navTextOn : styles.navText}>{label}</Text>
    </Pressable>
  );
}

interface OptionProps {
  label: string;
  literal?: boolean;
  selected: boolean;
  disabled: boolean;
  solid?: boolean;
  fill?: boolean;
  styles: AdminStyles;
  onPress: () => void;
}

function Option({
  label,
  literal = false,
  selected,
  disabled,
  solid = false,
  fill = false,
  styles,
  onPress,
}: OptionProps) {
  const marked = selected && solid;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.option,
        fill && styles.optionFill,
        selected && styles.optionOn,
        marked && styles.optionSolid,
        disabled && styles.optionDisabled,
      ]}
    >
      <Text
        style={marked ? styles.optionTextSolid : styles.optionText}
        translate={!literal}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected && !solid ? (
        <Text style={styles.optionText} translate={false}>
          ✓
        </Text>
      ) : null}
    </Pressable>
  );
}

interface KeyChoiceProps {
  item: AdminKey;
  selected: boolean;
  disabled: boolean;
  styles: AdminStyles;
  onChoose: (id: string) => void;
}

function KeyChoice({ item, selected, disabled, styles, onChoose }: KeyChoiceProps) {
  const choose = useCallback(() => onChoose(item.id), [item.id, onChoose]);
  return (
    <Option
      label={item.label}
      literal
      selected={selected}
      disabled={disabled}
      styles={styles}
      onPress={choose}
    />
  );
}

interface KeyRowProps {
  item: AdminKey;
  busy: boolean;
  confirm: boolean;
  styles: AdminStyles;
  onConfirm: (id: string | null) => void;
  onCancel: (id: string | null) => void;
  onDelete: (id: string) => void;
}

function KeyRow({ item, busy, confirm, styles, onConfirm, onCancel, onDelete }: KeyRowProps) {
  const confirmDelete = useCallback(() => onConfirm(item.id), [item.id, onConfirm]);
  const cancel = useCallback(() => onCancel(null), [onCancel]);
  const remove = useCallback(() => onDelete(item.id), [item.id, onDelete]);
  return (
    <View style={styles.line}>
      <Cell box={[styles.cell, styles.colLabel]} text={styles.cellText} literal>
        {item.label}
      </Cell>
      <Cell box={[styles.cell, styles.colSecret]} text={styles.cellText} literal>
        {`••••${item.last_four}`}
      </Cell>
      <Cell box={[styles.cell, styles.colChecked]} text={styles.cellText} literal>
        {when(item.validated_at)}
      </Cell>
      <Cell box={[styles.cell, styles.colUsed]} text={styles.cellText} literal>
        {String(item.assigned_users_count)}
      </Cell>
      <View style={[styles.cell, styles.colKeyActions, confirm ? styles.actionStack : styles.actionRow]}>
        {confirm ? (
          <>
            <Button quiet danger disabled={busy} onPress={remove}>
              Confirm delete
            </Button>
            <Button quiet secondary disabled={busy} onPress={cancel}>
              Cancel
            </Button>
          </>
        ) : (
          <Button quiet secondary disabled={busy} onPress={confirmDelete}>
            Delete
          </Button>
        )}
      </View>
    </View>
  );
}

interface UserRowProps {
  user: AdminUser;
  self: boolean;
  busy: boolean;
  confirm: boolean;
  styles: AdminStyles;
  onAssign: (user: AdminUser) => void;
  onConfirm: (id: string | null) => void;
  onCancel: (id: string | null) => void;
  onDelete: (id: string) => void;
}

function UserRow({
  user,
  self,
  busy,
  confirm,
  styles,
  onAssign,
  onConfirm,
  onCancel,
  onDelete,
}: UserRowProps) {
  const assign = useCallback(() => onAssign(user), [onAssign, user]);
  const confirmDelete = useCallback(() => onConfirm(user.id), [onConfirm, user.id]);
  const cancel = useCallback(() => onCancel(null), [onCancel]);
  const remove = useCallback(() => onDelete(user.id), [onDelete, user.id]);
  const name = user.display_name || user.email || user.id;
  return (
    <View style={styles.line}>
      <View style={[styles.cell, styles.colUser]}>
        <Text style={styles.cellText} translate={false} numberOfLines={1}>
          {name}
        </Text>
        {user.email && user.email !== name && (
          <Text style={styles.headText} translate={false} numberOfLines={1}>
            {user.email}
          </Text>
        )}
      </View>
      <Cell box={[styles.cell, styles.colJoined]} text={styles.cellText} literal>
        {when(user.created_at)}
      </Cell>
      <Cell box={[styles.cell, styles.colChats]} text={styles.cellText} literal>
        {String(user.conversations_count)}
      </Cell>
      <Cell box={[styles.cell, styles.colSpend]} text={styles.cellText} literal>
        {`$${user.total_cost_usd}`}
      </Cell>
      <Cell box={[styles.cell, styles.colFlag]} text={styles.cellText}>
        {user.has_personal_key ? 'Yes' : 'No'}
      </Cell>
      <Cell box={[styles.cell, styles.colServer]} text={styles.cellText} literal={user.managed_key != null}>
        {user.managed_key?.label ?? 'None'}
      </Cell>
      <Cell box={[styles.cell, styles.colPriority]} text={styles.cellText}>
        {user.key_priority === 'server' ? 'Server' : 'Personal'}
      </Cell>
      <View style={[styles.cell, styles.colUserActions, confirm ? styles.actionStack : styles.actionRow]}>
        <Button quiet secondary disabled={busy} onPress={assign}>
          Assign
        </Button>
        {!self &&
          (confirm ? (
            <>
              <Button quiet danger disabled={busy} onPress={remove}>
                Confirm delete
              </Button>
              <Button quiet secondary disabled={busy} onPress={cancel}>
                Cancel
              </Button>
            </>
          ) : (
            <Button quiet danger disabled={busy} onPress={confirmDelete}>
              Delete
            </Button>
          ))}
      </View>
    </View>
  );
}
