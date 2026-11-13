import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, Text } from './locale-ui';
import { useLocale, type LanguageChoice } from './locale';
import { useAuth } from './auth';
import { useTheme, type ThemeChoice } from './theme';
import { useCredential, useProfile } from './queries';
import { api, json } from './api';
import { ChatGptIcon, type ChatGptIconName } from './chatgpt-icons';
import { Button, Copy, ErrorNotice, Field } from './ui';
import type { Integration } from './types';

export type SettingsTab = 'general' | 'key' | 'connections' | 'data' | 'account';

const tabs: { id: SettingsTab; label: string; icon: ChatGptIconName }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'key', label: 'OpenRouter key', icon: 'sliders' },
  { id: 'connections', label: 'Connections', icon: 'globe' },
  { id: 'data', label: 'Data & account', icon: 'library' },
  { id: 'account', label: 'Your account', icon: 'projects' },
];

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.borderSubtle,
        gap: 10,
      }}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: c.text }}>{label}</Text>
        {description && (
          <Text style={{ fontSize: 12, color: c.muted, lineHeight: 18 }}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

export function SettingsContent({
  initialTab = 'general',
  onClose,
}: {
  initialTab?: SettingsTab;
  onClose?: () => void;
}) {
  const { choice, saveLanguage, t } = useLocale();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [languageBusy, setLanguageBusy] = useState(false);
  const cache = useQueryClient();
  const auth = useAuth();
  const profile = useProfile();
  const saved = useCredential();
  const { setChoice, colors: c, isDark } = useTheme();
  const wide = useWindowDimensions().width >= 720;

  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [timezone, setTimezone] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  const integration = useQuery({
    queryKey: ['integration'],
    queryFn: () => api<Integration>('/v1/integrations/google'),
    enabled: tab === 'connections',
    refetchInterval: 5000,
    retry: false,
  });

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (profile.data) setTimezone(profile.data.timezone);
  }, [profile.data]);

  async function saveKey() {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await api(
        '/v1/credentials/openrouter',
        json('PUT', { api_key: key }, saved.data?.version ?? 0),
      );
      setKey('');
      setNotice('Key saved securely.');
      await cache.invalidateQueries({ queryKey: ['credential'] });
      await cache.invalidateQueries({ queryKey: ['models'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function appearance(theme: ThemeChoice) {
    if (!profile.data) return;
    try {
      await api('/v1/profile', json('PATCH', { theme }, profile.data.version));
      setChoice(theme);
      await cache.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      setError(e);
    }
  }

  async function saveTimezone() {
    if (!profile.data) return;
    try {
      await api('/v1/profile', json('PATCH', { timezone }, profile.data.version));
      setNotice('Timezone saved.');
      await cache.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      setError(e);
    }
  }

  async function connectGoogle(capability: 'gmail' | 'calendar') {
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

  async function disconnectGoogle(capability: 'gmail' | 'calendar') {
    try {
      await api(
        `/v1/integrations/google/capabilities/${capability}`,
        json('DELETE', undefined, integration.data?.version),
      );
      await cache.invalidateQueries({ queryKey: ['integration'] });
      await cache.invalidateQueries({ queryKey: ['capabilities'] });
    } catch (e) {
      setError(e);
    }
  }

  async function removeAccount() {
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
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          height: 56,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.border,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 18, fontWeight: '600', color: c.text }}
        >
          Settings
        </Text>
        {onClose && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            onPress={onClose}
            style={({ hovered }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: hovered ? c.hover : 'transparent',
            })}
          >
            <ChatGptIcon name="close" size={16} color={c.muted} />
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', minHeight: 0 }}>
        {/* Left Navigation Column */}
        {wide ? (
          <View
            style={{
              width: 200,
              borderRightWidth: StyleSheet.hairlineWidth,
              borderRightColor: c.border,
              padding: 10,
              gap: 2,
            }}
          >
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(item.id)}
                  style={({ hovered }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    height: 38,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: active ? c.selected : hovered ? c.hover : 'transparent',
                  })}
                >
                  <ChatGptIcon name={item.icon} size={16} color={active ? c.text : c.muted} />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: active ? '500' : '400',
                      color: active ? c.text : c.muted,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
          >
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(item.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 9999,
                    backgroundColor: active ? c.selected : 'transparent',
                  }}
                >
                  <ChatGptIcon name={item.icon} size={14} color={active ? c.text : c.muted} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: active ? '600' : '400',
                      color: active ? c.text : c.muted,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Right Content Column */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 24 }}>
          <ErrorNotice error={error ?? profile.error ?? saved.error} />
          {!!notice && (
            <View
              style={{
                marginTop: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: isDark ? 'rgba(16, 163, 127, 0.16)' : 'rgba(16, 163, 127, 0.1)',
              }}
            >
              <Text style={{ fontSize: 13, color: c.success }}>{notice}</Text>
            </View>
          )}

          {tab === 'general' && (
            <>
              <SettingRow label="Appearance">
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(['system', 'light', 'dark'] as ThemeChoice[]).map((theme) => (
                    <Button
                      key={theme}
                      secondary={profile.data?.theme !== theme}
                      onPress={() => void appearance(theme)}
                    >
                      {theme[0]!.toUpperCase() + theme.slice(1)}
                    </Button>
                  ))}
                </View>
              </SettingRow>

              <SettingRow
                label="Language"
                description="Automatic language follows your device language and region. Your choice syncs across devices."
              >
                <View
                  role="radiogroup"
                  accessibilityLabel={t('Language')}
                  style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}
                >
                  {(['auto', 'ru', 'en'] as LanguageChoice[]).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      aria-checked={choice === value}
                      accessibilityState={{ checked: choice === value, disabled: languageBusy }}
                      disabled={languageBusy}
                      onPress={() => {
                        setLanguageBusy(true);
                        setError(null);
                        void saveLanguage(value)
                          .then(() => setNotice('Language saved.'))
                          .catch(setError)
                          .finally(() => setLanguageBusy(false));
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 9999,
                        borderWidth: 1,
                        borderColor: choice === value ? c.text : c.border,
                        backgroundColor: choice === value ? c.selected : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 14, color: c.text }}>
                        {value === 'auto' ? 'Automatic' : value === 'ru' ? 'Русский' : 'English'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </SettingRow>

              <SettingRow label="Calendar timezone">
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Field
                    accessibilityLabel="Calendar timezone"
                    placeholder="Europe/Warsaw"
                    value={timezone}
                    onChangeText={setTimezone}
                    style={{ flex: 1 }}
                  />
                  <Button secondary onPress={() => void saveTimezone()}>
                    Save timezone
                  </Button>
                </View>
              </SettingRow>
            </>
          )}

          {tab === 'key' && (
            <SettingRow
              label="OpenRouter key"
              description="Your key is encrypted on the server. Model requests use your OpenRouter balance. Other service costs are separate."
            >
              <Copy small muted>
                {saved.data?.configured ? `Connected · ••••${saved.data.last_four}` : 'No key connected'}
              </Copy>
              <Field
                accessibilityLabel="OpenRouter API key"
                placeholder="New OpenRouter API key"
                value={key}
                onChangeText={setKey}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button secondary onPress={() => setShow(!show)}>
                  {show ? 'Hide key' : 'Show key'}
                </Button>
                <Button disabled={busy || !key.trim()} onPress={() => void saveKey()}>
                  {busy ? 'Validating…' : 'Save key'}
                </Button>
                {saved.data?.configured && (
                  <Button
                    secondary
                    onPress={() =>
                      void api(
                        '/v1/credentials/openrouter',
                        json('DELETE', undefined, saved.data.version),
                      )
                        .then(() => {
                          setNotice('Key removed. Active requests are stopping.');
                          void cache.invalidateQueries({ queryKey: ['credential'] });
                          cache.removeQueries({ queryKey: ['models'] });
                        })
                        .catch(setError)
                    }
                  >
                    Remove key and stop active tasks
                  </Button>
                )}
                <Button
                  secondary
                  onPress={() => void Linking.openURL('https://openrouter.ai/settings/keys')}
                >
                  Manage OpenRouter balance & keys ↗
                </Button>
              </View>
            </SettingRow>
          )}

          {tab === 'connections' && (
            <>
              <SettingRow
                label="Google connections"
                description="Connect only the services you want the agent to use. Writes require a separate confirmation in the chat."
              >
                <ErrorNotice error={integration.error} />
                {integration.data?.account_email && (
                  <Copy small>Connected account: {integration.data.account_email}</Copy>
                )}
              </SettingRow>
              {(['gmail', 'calendar'] as const).map((capability) => (
                <SettingRow
                  key={capability}
                  label={capability === 'gmail' ? 'Gmail' : 'Google Calendar'}
                  description={
                    capability === 'gmail'
                      ? 'Search and read messages, prepare drafts, and send approved plain-text emails.'
                      : 'Read primary-calendar events, check availability, and create or update approved events.'
                  }
                >
                  <Copy small muted>
                    {integration.data?.capabilities[capability]
                      ? integration.data.status === 'reauth_required'
                        ? 'Authorization expired — reconnect'
                        : 'Connected'
                      : 'Not connected'}
                  </Copy>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {integration.data?.capabilities[capability] && (
                      <Button secondary onPress={() => void disconnectGoogle(capability)}>
                        Disconnect and stop related tasks
                      </Button>
                    )}
                    <Button disabled={busy} onPress={() => void connectGoogle(capability)}>
                      {integration.data?.capabilities[capability] ? 'Reconnect' : 'Connect'}
                    </Button>
                  </View>
                </SettingRow>
              ))}
              <View style={{ paddingTop: 12 }}>
                <Copy small muted>
                  Disconnecting stops new actions immediately. Already submitted operations may
                  finish. When the last service is disconnected, the server also attempts to revoke
                  its Google grant.
                </Copy>
              </View>
            </>
          )}

          {tab === 'data' && (
            <>
              <SettingRow
                label="Stored data"
                description="Conversations, documents, and tool results are stored on the server to sync across devices. Keys and integration credentials are encrypted. Relevant content is sent to the model and tools used by your requests."
              >
                <Copy small muted>
                  Delete a conversation from its Tools menu to remove that chat and its documents.
                  Deleting a document removes the original and retrieval index; existing answers can
                  still quote it until the conversation is deleted.
                </Copy>
              </SettingRow>
              <SettingRow
                label="Delete your account"
                description="Access is disabled immediately and running tasks are stopped. The server removes your stored data and attempts Google revocation. Upload-token expiry can delay physical cleanup for up to two hours; provider outages can extend revocation retries up to 24 hours. Backups expire within 30 days and operational logs within 14 days under the deployment policy."
              >
                <Copy small muted>
                  Sent emails, calendar changes, and provider-retained data are not undone by
                  deleting the account.
                </Copy>
                <Field
                  accessibilityLabel="Type DELETE to confirm account deletion"
                  placeholder="Type DELETE to confirm"
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoCapitalize="characters"
                />
                <View style={{ flexDirection: 'row' }}>
                  <Button
                    danger
                    disabled={busy || confirmation !== 'DELETE'}
                    onPress={() => void removeAccount()}
                  >
                    {busy ? 'Deleting…' : 'Permanently delete account'}
                  </Button>
                </View>
              </SettingRow>
            </>
          )}

          {tab === 'account' && (
            <SettingRow label="Your account">
              <Copy translate={false}>
                {profile.data?.display_name ?? auth.session?.user.email ?? t('Your account')}
              </Copy>
              <Copy small muted>
                {auth.session?.user.email}
              </Copy>
              <View style={{ flexDirection: 'row' }}>
                <Button secondary onPress={() => void auth.signOut()}>
                  Sign out
                </Button>
              </View>
            </SettingRow>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

export function SettingsModal({
  visible,
  close,
  initialTab = 'general',
}: {
  visible: boolean;
  close: () => void;
  initialTab?: SettingsTab;
}) {
  const { colors: c, isDark } = useTheme();
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.45)',
        }}
      >
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View
          testID="settings-modal"
          style={{
            width: '100%',
            maxWidth: 740,
            height: 540,
            maxHeight: '88%',
            backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.border,
            overflow: 'hidden',
            ...(Platform.OS === 'web'
              ? {
                  boxShadow: isDark
                    ? '0 20px 60px rgba(0, 0, 0, 0.6)'
                    : '0 16px 48px rgba(0, 0, 0, 0.16)',
                }
              : {}),
          }}
        >
          <SettingsContent initialTab={initialTab} onClose={close} />
        </View>
      </View>
    </Modal>
  );
}
