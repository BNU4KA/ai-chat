import { Pressable, Text } from './locale-ui';
import { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ChatGptIcon, type ChatGptIconName } from './chatgpt-icons';
import { useTheme } from './theme';

function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: ChatGptIconName;
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
          width: 32,
          height: 32,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hovered || pressed ? c.hover : 'transparent',
          opacity: disabled ? 0.35 : hovered || pressed ? 1 : 0.72,
        })}
      >
        <ChatGptIcon name={icon} size={16} color={hovered ? c.text : c.muted} />
      </Pressable>
      {hovered && Platform.OS === 'web' && (
        <View
          testID="action-tooltip"
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 38,
            left: 0,
            paddingVertical: 4,
            paddingHorizontal: 8,
            borderRadius: 6,
            backgroundColor: c.text,
            minWidth: 96,
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
  onEdit,
  onWorkWithResponse,
  onSaveDocument,
  onError,
}: {
  text: string;
  assistant: boolean;
  canRetry?: boolean;
  busy?: boolean;
  onRetry: () => void;
  onEdit?: () => void;
  onWorkWithResponse?: () => void;
  onSaveDocument?: () => void;
  onError: (error: unknown) => void;
}) {
  const { colors: c, isDark } = useTheme();
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!notice && !copied) return;
    const timer = setTimeout(() => {
      setNotice('');
      setCopied(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [notice, copied]);

  async function copy() {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
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
          setCopied(true);
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
      style={{ alignSelf: assistant ? 'flex-start' : 'flex-end', gap: 4, position: 'relative' }}
    >
      <View
        accessibilityLabel={assistant ? 'Response actions' : 'Message actions'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          marginLeft: assistant ? -6 : 0,
        }}
      >
        <IconButton
          icon={copied ? 'check' : 'copy'}
          label="Copy message"
          disabled={!text}
          onPress={() => void copy()}
        />
        {!assistant && onEdit && (
          <IconButton
            icon="edit"
            label="Edit into a new branch"
            disabled={busy}
            onPress={onEdit}
          />
        )}
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
        {assistant && (onWorkWithResponse || onSaveDocument) && (
          <IconButton
            icon="dots"
            label="More message actions"
            disabled={!text}
            onPress={() => setMoreOpen((v) => !v)}
          />
        )}
      </View>

      {moreOpen && (
        <View
          testID="popover-menu"
          style={{
            position: 'absolute',
            top: 36,
            left: 0,
            minWidth: 196,
            padding: 4,
            borderRadius: 12,
            backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
            borderWidth: 1,
            borderColor: c.border,
            zIndex: 40,
            gap: 2,
            ...(Platform.OS === 'web'
              ? {
                  boxShadow: isDark
                    ? '0 8px 24px rgba(0,0,0,0.5)'
                    : '0 6px 20px rgba(0,0,0,0.12)',
                }
              : {}),
          }}
        >
          {onWorkWithResponse && (
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                setMoreOpen(false);
                onWorkWithResponse();
              }}
              style={({ hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: hovered ? c.hover : 'transparent',
              })}
            >
              <ChatGptIcon name="sliders" size={14} color={c.text} />
              <Text style={{ fontSize: 13, color: c.text }}>Work with response</Text>
            </Pressable>
          )}
          {onSaveDocument && (
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                setMoreOpen(false);
                onSaveDocument();
              }}
              style={({ hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: hovered ? c.hover : 'transparent',
              })}
            >
              <ChatGptIcon name="library" size={14} color={c.text} />
              <Text style={{ fontSize: 13, color: c.text }}>Save as document</Text>
            </Pressable>
          )}
        </View>
      )}

      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: c.muted }}>
          {notice}
        </Text>
      )}
    </View>
  );
}
