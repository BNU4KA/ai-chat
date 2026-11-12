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
import { Button, Copy, ErrorNotice, Field, PanelRedirect } from '../../src/ui';
import { Help, Section } from '../../src/dialog';
import { TimezoneSelect } from '../../src/timezone-select';
export function SettingsScreen() {
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
  async function saveTimezone(next: string) {
    if (!profile.data || next === profile.data.timezone) return;
    setTimezone(next);
    try {
      await api('/v1/profile', json('PATCH', { timezone: next }, profile.data.version));
      showToast('Timezone saved.');
      await cache.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      setError(e);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <ErrorNotice error={error ?? profile.error ?? saved.error} />
      <Section
        title="Account"
        help="This is the Google account that signs you in. The name and email come from that account. Signing out ends the session on this device and does not delete your chats."
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Copy translate={false}>
              {profile.data?.display_name ?? auth.session?.user.email ?? t('Your account')}
            </Copy>
            <Copy small muted>
              {auth.session?.user.email}
            </Copy>
          </View>
          <Button secondary onPress={() => void auth.signOut()}>
            Sign out
          </Button>
        </View>
      </Section>
      <Section
        title="Language"
        help="Automatic uses this device's language. Russian or English overrides it. The choice is saved on your account and follows you to every device."
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
                  .then(() => showToast('Language saved.'))
                  .catch(setError)
                  .finally(() => setLanguageBusy(false));
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: choice === value ? c.accent : c.border,
                backgroundColor: choice === value ? c.selected : 'transparent',
                opacity: languageBusy ? 0.45 : 1,
              }}
            >
              <Text style={{ color: c.text }}>
                {value === 'auto' ? 'Automatic' : value === 'ru' ? 'Русский' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>
      <Section
        title="OpenRouter key"
        help="The agent calls models with your own OpenRouter key. The key is encrypted on the server and is not shown again after you save it. Model requests spend your OpenRouter balance. Mail, calendar, and other tools are not paid from that balance."
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
        </View>
      </Section>
      <Section
        title="Appearance"
        help="System follows this device. Light and dark stay fixed. The calendar timezone is used for scheduled tasks and for the times you see on the calendar. It does not change the language."
      >
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
        <TimezoneSelect label="Calendar timezone" value={timezone} onChange={(next) => void saveTimezone(next)} />
      </Section>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Button secondary onPress={() => router.setParams({ panel: 'connections' })}>
            Manage Gmail & Calendar
          </Button>
          <Help
            title="Connections"
            text="Signing in with Google does not let the agent read mail or the calendar. Connect those separately. The agent still asks in the chat before it sends mail or changes an event."
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Button secondary onPress={() => router.setParams({ panel: 'data' })}>
            Data & account
          </Button>
          <Help
            title="Your data"
            text="Conversations and documents are stored so they sync between devices. Open this to see what is kept and to delete the account. Deleting the account does not unsend mail or undo calendar changes."
          />
        </View>
      </View>
    </View>
  );
}
export default function SettingsRoute() {
  return <PanelRedirect panel="settings" />;
}
