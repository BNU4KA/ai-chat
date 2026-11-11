import { Text } from '../src/locale-ui';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '../src/auth';
import { useTheme } from '../src/theme';
import { Button, Copy, ErrorNotice, Panel } from '../src/ui';
export default function SignInScreen() {
  const { signIn, configured } = useAuth();
  const { colors: c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function login() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}
    >
      <View style={{ width: '100%', maxWidth: 440, gap: 24 }}>
        <View style={{ gap: 12 }}>
          <Text style={{ color: c.accent, fontSize: 14, fontWeight: '700', letterSpacing: 2 }}>
            AI CHAT
          </Text>
          <Text style={{ fontSize: 38, fontWeight: '700', lineHeight: 45, color: c.text }}>
            A little more than a conversation.
          </Text>
          <Copy muted>Your models. Your tools. One place to think and get things done.</Copy>
        </View>
        <Panel>
          <Button disabled={busy || !configured} onPress={() => void login()}>
            {busy ? 'Connecting…' : 'Continue with Google'}
          </Button>
          <ErrorNotice error={error} />
          {!configured && (
            <Copy muted small>
              Sign-in is not available yet. Please contact the service owner.
            </Copy>
          )}
          <Copy muted small>
            Your first sign-in creates your account. Gmail and Calendar are connected separately,
            only when you choose.
          </Copy>
        </Panel>
        <Copy muted small>
          Bring your own OpenRouter key. Conversations and files sync through the server. Relevant
          content is shared with the model and tools you use.
        </Copy>
      </View>
    </ScrollView>
  );
}
