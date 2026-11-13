import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { SettingsContent } from '../../src/settings-modal';
import { useTheme } from '../../src/theme';
import { Button } from '../../src/ui';

export default function Connections() {
  const router = useRouter();
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 780,
          alignSelf: 'center',
          paddingTop: 12,
        }}
      >
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 4 }}>
          <Button secondary quiet label="Back to conversations" onPress={() => router.replace('/')}>
            ← Back
          </Button>
        </View>
        <SettingsContent initialTab="connections" />
      </View>
    </View>
  );
}
