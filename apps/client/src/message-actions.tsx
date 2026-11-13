import { Pressable, Text } from './locale-ui';
import { useEffect, useState } from 'react';
import { Modal, Platform, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
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
  onPress: (target: unknown) => void;
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
        onPress={(e) => onPress(e.currentTarget)}
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
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!notice && !copied) return;
    const timer = setTimeout(() => {
      setNotice('');
      setCopied(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [notice, copied]);

  useEffect(() => {
    if (!menuPos || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuPos(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuPos]);

  function openMoreMenu(target: unknown) {
    if (menuPos) {
      setMenuPos(null);
      return;
    }
    const menuWidth = 216;
    const menuHeight = 96;
    const measurable = target as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    if (measurable && typeof measurable.measureInWindow === 'function') {
      measurable.measureInWindow((x, y, _w, h) => {
        const left = Math.max(8, Math.min(x, winWidth - menuWidth - 8));
        const fitsBelow = y + h + 6 + menuHeight <= winHeight - 8;
        const top = fitsBelow ? y + h + 6 : Math.max(8, y - menuHeight - 6);
        setMenuPos({ left, top });
      });
    } else {
      setMenuPos({ left: 24, top: 200 });
    }
  }

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
      style={{ alignSelf: assistant ? 'flex-start' : 'flex-end', gap: 4 }}
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
            onPress={() => onEdit()}
          />
        )}
        {assistant && canRetry && (
          <IconButton
            icon="retry"
            label="Retry last response"
            disabled={busy}
            onPress={() => onRetry()}
          />
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
            onPress={(target) => openMoreMenu(target)}
          />
        )}
      </View>

      <Modal
        visible={!!menuPos}
        transparent
        animationType="none"
        onRequestClose={() => setMenuPos(null)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            accessibilityLabel="Close menu"
            onPress={() => setMenuPos(null)}
            style={StyleSheet.absoluteFill}
          />
          {menuPos && (
            <View
              testID="popover-menu"
              style={{
                position: 'absolute',
                left: menuPos.left,
                top: menuPos.top,
                minWidth: 210,
                padding: 5,
                borderRadius: 12,
                backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
                borderWidth: 1,
                borderColor: c.border,
                gap: 2,
                ...(Platform.OS === 'web'
                  ? {
                      boxShadow: isDark
                        ? '0 12px 32px rgba(0,0,0,0.6)'
                        : '0 8px 24px rgba(0,0,0,0.14)',
                    }
                  : {}),
              }}
            >
              {onWorkWithResponse && (
                <Pressable
                  accessibilityRole="menuitem"
                  onPress={() => {
                    setMenuPos(null);
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
                    setMenuPos(null);
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
        </View>
      </Modal>

      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: c.muted }}>
          {notice}
        </Text>
      )}
    </View>
  );
}
