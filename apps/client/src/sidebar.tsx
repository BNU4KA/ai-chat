import { Pressable, Text } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { ErrorNotice, Field } from './ui';
import type { Conversation } from './types';

export function useSidebarTransition() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return Platform.OS === 'web'
    ? {
        transitionProperty: 'width' as const,
        transitionDuration: reduced ? '0ms' : '240ms',
        transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)' as const,
      }
    : {};
}

type SidebarProps = {
  expanded: boolean;
  pinned?: boolean;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  mobile?: boolean;
  selectedId?: string;
  conversations: Conversation[];
  search: string;
  onSearch: (value: string) => void;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onSettings: () => void;
  displayName?: string | null;
  busy: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  onMore: () => void;
};

function NavIcon({ kind }: { kind: 'menu' | 'new' | 'search' | 'chat' | 'settings' }) {
  const { colors: c } = useTheme();
  if (kind === 'menu')
    return (
      <View testID="nav-icon" style={[styles.icon, { transform: [{ scale: 0.88 }] }]}>
        {[0, 1, 2].map((line) => (
          <View
            key={line}
            style={{
              width: 18,
              height: 1.5,
              backgroundColor: c.muted,
              borderRadius: 1,
              marginVertical: 2,
            }}
          />
        ))}
      </View>
    );
  if (kind === 'search')
    return (
      <View testID="nav-icon" style={[styles.icon, { transform: [{ scale: 0.88 }] }]}>
        <View
          style={{
            width: 13,
            height: 13,
            borderWidth: 1.7,
            borderColor: c.muted,
            borderRadius: 7,
            marginTop: -3,
            marginLeft: -3,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: 7,
            height: 1.7,
            backgroundColor: c.muted,
            transform: [{ rotate: '45deg' }],
            left: 15,
            top: 17,
          }}
        />
      </View>
    );
  if (kind === 'chat')
    return (
      <View testID="nav-icon" style={[styles.icon, { transform: [{ scale: 0.88 }] }]}>
        <View
          style={{ width: 17, height: 14, borderWidth: 1.4, borderColor: c.muted, borderRadius: 4 }}
        />
      </View>
    );
  return (
    <View testID="nav-icon" style={[styles.icon, { transform: [{ scale: 0.88 }] }]}>
      <Text
        style={{
          fontSize: kind === 'new' ? 28 : 22,
          lineHeight: 30,
          color: c.muted,
          fontWeight: '400',
          textAlign: 'center',
        }}
      >
        {kind === 'new' ? '＋' : '⚙'}
      </Text>
    </View>
  );
}

export function ConversationSidebar(props: SidebarProps) {
  const { colors: c } = useTheme();
  const inset = useSafeAreaInsets();
  const input = useRef<ComponentRef<typeof Field>>(null);
  const transition = useSidebarTransition();
  const name = props.displayName?.trim() || 'Your workspace';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  function startSearch() {
    if (!props.expanded) props.onToggle();
    setTimeout(() => input.current?.focus(), 0);
  }
  return (
    <View
      testID={props.mobile ? 'conversation-drawer' : 'conversation-sidebar'}
      style={[
        styles.sidebar,
        !props.mobile && transition,
        {
          width: props.mobile ? '100%' : props.expanded ? 280 : 72,
          backgroundColor: c.sidebar,
          overflow: 'hidden',
          paddingTop: props.mobile ? Math.max(inset.top, 12) : 12,
          paddingBottom: props.mobile ? Math.max(inset.bottom, 12) : 12,
        },
      ]}
    >
      <View style={[styles.topRow, props.expanded && !props.mobile && { width: 256 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            props.mobile
              ? 'Close conversation history'
              : props.pinned
                ? 'Collapse conversation sidebar'
                : 'Expand conversation sidebar'
          }
          accessibilityState={{ expanded: props.expanded }}
          onPress={props.onToggle}
          style={({ pressed, hovered }) => [
            styles.iconButton,
            { backgroundColor: pressed || hovered ? c.hover : 'transparent' },
          ]}
        >
          <NavIcon kind="menu" />
        </Pressable>
        {props.expanded && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search conversation history"
            onPress={startSearch}
            style={({ pressed, hovered }) => [
              styles.iconButton,
              { backgroundColor: pressed || hovered ? c.hover : 'transparent' },
            ]}
          >
            <NavIcon kind="search" />
          </Pressable>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New conversation"
        disabled={props.busy}
        onPress={props.onNew}
        style={({ pressed, hovered }) => [
          styles.newChat,
          {
            alignSelf: props.expanded ? 'flex-start' : 'center',
            paddingHorizontal: props.expanded ? 14 : 10,
            backgroundColor: pressed || hovered ? c.hover : c.control,
            opacity: props.busy ? 0.5 : 1,
          },
        ]}
      >
        <NavIcon kind="new" />
        {props.expanded && (
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '500' }}>New chat</Text>
        )}
      </Pressable>
      {props.expanded ? (
        <View style={[styles.history, !props.mobile && { width: 256 }]}>
          <Field
            ref={input}
            onFocus={props.onSearchFocus}
            onBlur={props.onSearchBlur}
            accessibilityLabel="Search conversations"
            placeholder="Search chats"
            value={props.search}
            onChangeText={props.onSearch}
            style={{
              backgroundColor: 'transparent',
              borderColor: c.border,
              borderRadius: 24,
              minHeight: 40,
              fontSize: 13,
              paddingVertical: 8,
            }}
          />
          <Text
            accessibilityRole="header"
            style={{
              color: c.muted,
              fontSize: 12,
              fontWeight: '600',
              paddingHorizontal: 12,
              marginTop: 12,
              marginBottom: 2,
            }}
          >
            {props.search ? 'Search results' : 'Recent'}
          </Text>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 3, paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {props.conversations.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityState={{ selected: props.selectedId === item.id }}
                onPress={() => props.onSelect(item.id)}
                style={({ pressed, hovered }) => [
                  styles.chatRow,
                  {
                    backgroundColor:
                      props.selectedId === item.id
                        ? c.selected
                        : pressed || hovered
                          ? c.hover
                          : 'transparent',
                  },
                ]}
              >
                <NavIcon kind="chat" />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: c.text,
                    fontWeight: props.selectedId === item.id ? '600' : '400',
                  }}
                >
                  {item.title}
                </Text>
              </Pressable>
            ))}
            {props.loading && (
              <FoolSpinner size={28} label="Loading conversations" style={{ marginTop: 12 }} />
            )}
            <ErrorNotice error={props.error} />
            {!props.loading && !props.error && !props.conversations.length && (
              <Text style={{ color: c.muted, fontSize: 13, lineHeight: 21, padding: 12 }}>
                {props.search ? 'No matching chats.' : 'Your conversations will appear here.'}
              </Text>
            )}
            {props.hasMore && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More conversations"
                disabled={props.loadingMore}
                onPress={props.onMore}
                style={styles.chatRow}
              >
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  {props.loadingMore ? 'Loading…' : 'Show more'}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View
        style={[
          styles.footer,
          {
            borderTopColor: c.border,
            borderTopWidth: props.expanded ? StyleSheet.hairlineWidth : 0,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={props.onSettings}
          style={({ pressed, hovered }) => [
            styles.footerRow,
            { backgroundColor: pressed || hovered ? c.hover : 'transparent' },
          ]}
        >
          <NavIcon kind="settings" />
          {props.expanded && <Text style={{ fontSize: 14, color: c.text }}>Settings</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Account settings for ${name}`}
          onPress={props.onSettings}
          style={({ pressed, hovered }) => [
            styles.footerRow,
            { backgroundColor: pressed || hovered ? c.hover : 'transparent' },
          ]}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: c.accentText }}>{initials}</Text>
          </View>
          {props.expanded && (
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: c.text }}>
              {name}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function ConversationDrawer({
  visible,
  close,
  children,
}: {
  visible: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [visible, close]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss conversation history"
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: '#00000070' }]}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: Math.min(320, width - 48),
            height: '100%',
            shadowColor: '#000',
            shadowOffset: { width: 6, height: 0 },
            shadowOpacity: 0.18,
            shadowRadius: 20,
            elevation: 16,
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  sidebar: { height: '100%', paddingHorizontal: 12 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    marginBottom: 24,
  },
  icon: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    borderRadius: 24,
    marginBottom: 24,
  },
  history: { flex: 1, gap: 10 },
  chatRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
    borderRadius: 22,
  },
  footer: { gap: 4, paddingTop: 10 },
  footerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 9,
    borderRadius: 22,
  },
});
