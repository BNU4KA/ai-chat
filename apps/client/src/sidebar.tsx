import { Pressable, Text } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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

export function MenuMark({ color }: { color: string }) {
  return (
    <View style={{ width: 16, height: 12, justifyContent: 'space-between' }}>
      {[0, 1, 2].map((line) => (
        <View key={line} style={{ height: 1.5, borderRadius: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}
function NavIcon({
  kind,
  color,
}: {
  kind: 'menu' | 'new' | 'search' | 'chat' | 'settings';
  color?: string;
}) {
  const { colors: c } = useTheme();
  const ink = color ?? c.muted;
  if (kind === 'menu')
    return (
      <View testID="nav-icon" style={styles.icon}>
        <MenuMark color={ink} />
      </View>
    );
  if (kind === 'search')
    return (
      <View testID="nav-icon" style={styles.icon}>
        <View
          style={{
            width: 13,
            height: 13,
            borderWidth: 1.7,
            borderColor: ink,
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
            backgroundColor: ink,
            transform: [{ rotate: '45deg' }],
            left: 15,
            top: 17,
          }}
        />
      </View>
    );
  if (kind === 'chat')
    return (
      <View testID="nav-icon" style={styles.icon}>
        <Svg width={18} height={16} viewBox="0 0 18 16" aria-hidden={true} focusable={false}>
          <Path
            d="M3 1.4h12a1.6 1.6 0 0 1 1.6 1.6v6.1a1.6 1.6 0 0 1-1.6 1.6H7.1L4.2 13.4V10.7H3A1.6 1.6 0 0 1 1.4 9.1V3A1.6 1.6 0 0 1 3 1.4Z"
            fill="none"
            stroke={ink}
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </View>
    );
  if (kind === 'new')
    return (
      <View testID="nav-icon" style={styles.icon}>
        <Svg
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden={true}
          focusable={false}
        >
          <Path
            d="M8 2.2v11.6M2.2 8h11.6"
            stroke={ink}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </Svg>
      </View>
    );
  return (
    <View testID="nav-icon" style={styles.icon}>
      <Svg width={18} height={18} viewBox="0 0 24 24" aria-hidden={true} focusable={false}>
        <Path
          d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
          fill="none"
          stroke={c.muted}
          strokeWidth={1.6}
        />
        <Path
          d="M12 3.2v2M12 18.8v2M4.9 6.1l1.4 1.4M17.7 16.5l1.4 1.4M3.2 12h2M18.8 12h2M4.9 17.9l1.4-1.4M17.7 7.5l1.4-1.4"
          fill="none"
          stroke={c.muted}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </Svg>
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
            backgroundColor: pressed || hovered ? c.cardPressed : c.card,
            borderWidth: 1,
            borderColor: c.cardEdge,
            opacity: props.busy ? 0.5 : 1,
          },
        ]}
      >
        <NavIcon kind="new" color={c.cardInk} />
        {props.expanded && (
          <Text style={{ color: c.cardInk, fontSize: 14, fontWeight: '500' }}>New chat</Text>
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
