import { Pressable, Text } from './locale-ui';
import { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from './theme';

type Icon = 'retry' | 'share' | 'copy';
function ActionIcon({ name, color }: { name: Icon; color: string }) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
      focusable={false}
    >
      {name === 'retry' && (
        <>
          <Path d="M20 4v6h-6" />
          <Path d="M20 10a8 8 0 1 0 .2 5" />
        </>
      )}
      {name === 'share' && (
        <>
          <Path d="M12 15V2m-4 4 4-4 4 4" />
          <Path d="M6 10H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1" />
        </>
      )}
      {name === 'copy' && (
        <>
          <Rect x={8} y={8} width={12} height={13} rx={2} />
          <Path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
        </>
      )}
    </Svg>
  );
}
function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: Icon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors: c } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hovered || pressed ? c.hover : 'transparent',
          opacity: disabled ? 0.35 : hovered || pressed ? 1 : 0.68,
        })}
      >
        <ActionIcon name={icon} color={hovered ? c.text : c.muted} />
      </Pressable>
      {hovered && Platform.OS === 'web' && (
        <View
          testID="action-tooltip"
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 44,
            left: 0,
            paddingVertical: 5,
            paddingHorizontal: 9,
            borderRadius: 6,
            backgroundColor: c.text,
            minWidth: 100,
            zIndex: 30,
          }}
        >
          <Text style={{ fontSize: 11, color: c.background }}>{label}</Text>
        </View>
      )}
    </View>
  );
}

export function MessageActions({
  text,
  assistant,
  canRetry = false,
  busy = false,
  onRetry,
  onError,
}: {
  text: string;
  assistant: boolean;
  canRetry?: boolean;
  busy?: boolean;
  onRetry: () => void;
  onError: (error: unknown) => void;
}) {
  const { colors: c } = useTheme();
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function copy() {
    try {
      await Clipboard.setStringAsync(text);
      setNotice('Copied');
    } catch (error) {
      onError(error);
    }
  }
  async function share() {
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ text });
        else {
          await Clipboard.setStringAsync(text);
          setNotice('Response copied to share');
        }
      } else await Share.share({ message: text });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) onError(error);
    }
  }
  return (
    <View
      testID={assistant ? 'assistant-message-actions' : 'user-message-actions'}
      style={{ alignSelf: assistant ? 'flex-start' : 'flex-end', gap: 4 }}
    >
      <View
        accessibilityLabel={assistant ? 'Response actions' : 'Message actions'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          marginLeft: assistant ? -8 : 0,
        }}
      >
        {assistant && canRetry && (
          <IconButton icon="retry" label="Retry last response" disabled={busy} onPress={onRetry} />
        )}
        {assistant && (
          <IconButton
            icon="share"
            label="Share response"
            disabled={!text}
            onPress={() => void share()}
          />
        )}
        <IconButton icon="copy" label="Copy message" disabled={!text} onPress={() => void copy()} />
      </View>
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: c.muted }}>
          {notice}
        </Text>
      )}
    </View>
  );
}
