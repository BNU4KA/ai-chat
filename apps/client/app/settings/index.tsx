import { useLocale, type LanguageChoice } from '../../src/locale';
import { Text, Pressable } from '../../src/locale-ui';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../src/auth';
import { useTheme, type ThemeChoice } from '../../src/theme';
import { useCredential, useProfile } from '../../src/queries';
import { api, json } from '../../src/api';
import { showToast } from '../../src/toast';
import { Button, Copy, ErrorNotice, Field, Page, Panel } from '../../src/ui';
export default function Settings() {
  const router = useRouter();
  const { choice, saveLanguage, t } = useLocale();
  const [languageBusy, setLanguageBusy] = useState(false);
  const cache = useQueryClient();
  const auth = useAuth();
  const profile = useProfile();
  const saved = useCredential();
  const { setChoice, colors: c } = useTheme();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [timezone, setTimezone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (profile.data) setTimezone(profile.data.timezone);
  }, [profile.data]);
  async function saveKey() {
    setBusy(true);
    setError(null);
    try {
      await api(
        '/v1/credentials/openrouter',
        json('PUT', { api_key: key }, saved.data?.version ?? 0),
      );
      setKey('');
      showToast('Key saved securely.');
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
      showToast('Timezone saved.');
      await cache.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Page title="Settings">
      <ErrorNotice error={error ?? profile.error ?? saved.error} />
      <Panel>
        <Copy translate={false}>
          {profile.data?.display_name ?? auth.session?.user.email ?? t('Your account')}
        </Copy>
        <Copy small muted>
          {auth.session?.user.email}
        </Copy>
        <Button secondary onPress={() => void auth.signOut()}>
          Sign out
        </Button>
      </Panel>
      <Panel>
        <Copy>Region</Copy>
        <Copy>Language</Copy>
        <Copy small muted>
          Automatic language follows your device language and region. Your choice syncs across
          devices.
        </Copy>
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
                  .then(() => showToast('Language saved.'))
                  .catch(setError)
                  .finally(() => setLanguageBusy(false));
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: c.cardEdge,
                backgroundColor: choice === value ? c.cardPressed : c.card,
                opacity: languageBusy ? 0.45 : 1,
              }}
            >
              <Text style={{ color: c.cardInk }}>
                {value === 'auto' ? 'Automatic' : value === 'ru' ? 'Русский' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
      </Panel>
      <Panel>
        <Copy>OpenRouter key</Copy>
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
              void api('/v1/credentials/openrouter', json('DELETE', undefined, saved.data.version))
                .then(() => {
                  showToast('Key removed. Active requests are stopping.');
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
        <Copy small muted>
          Your key is encrypted on the server. Model requests use your OpenRouter balance. Other
          service costs are separate.
        </Copy>
      </Panel>
      <Panel>
        <Copy>Connections</Copy>
        <Copy small muted>
          Google sign-in and access to your mail or calendar are separate.
        </Copy>
        <Button secondary onPress={() => router.push('/settings/connections')}>
          Manage Gmail & Calendar
        </Button>
      </Panel>
      <Panel>
        <Copy>Appearance</Copy>
        <View style={{ flexDirection: 'row', gap: 8 }}>
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
        <Copy>Calendar timezone</Copy>
        <Field
          accessibilityLabel="Calendar timezone"
          placeholder="Europe/Warsaw"
          value={timezone}
          onChangeText={setTimezone}
        />
        <Button secondary onPress={() => void saveTimezone()}>
          Save timezone
        </Button>
      </Panel>
      <Panel>
        <Copy>Your data</Copy>
        <Copy small muted>
          Manage your account and delete your stored conversations.
        </Copy>
        <Button secondary onPress={() => router.push('/settings/data')}>
          Data & account
        </Button>
      </Panel>
    </Page>
  );
}
