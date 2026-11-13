import { Pressable, Text } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatGptIcon, type ChatGptIconName } from './chatgpt-icons';
import { useTheme } from './theme';
import { ErrorNotice } from './ui';
import type { Conversation } from './types';

export const BRAND_NAME = "it's kawasaki, bitches";

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
        transitionDuration: reduced ? '0ms' : '220ms',
        transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)' as const,
      }
    : {};
}

function dateBucket(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = date.getTime();
  const dayMs = 86400000;
  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfToday - dayMs) return 'Yesterday';
  if (ts >= startOfToday - 7 * dayMs) return 'Previous 7 Days';
  if (ts >= startOfToday - 30 * dayMs) return 'Previous 30 Days';
  return 'Older';
}

type SidebarProps = {
  expanded: boolean;
  mobile?: boolean;
  selectedId?: string;
  activeSection?: 'projects' | 'documents' | 'schedules' | 'notices' | 'search';
  conversations: Conversation[];
  pinnedIds?: string[];
  onToggle: () => void;
  onNew: () => void;
  onOpenSearch: () => void;
  onSelect: (id: string) => void;
  onTogglePin?: (conversation: Conversation) => void;
  onRename?: (conversation: Conversation) => void;
  onDelete?: (conversation: Conversation) => void;
  onWorkspace?: (tab: 'projects' | 'documents' | 'schedules' | 'notices' | 'search') => void;
  onConnections?: () => void;
  onSettings: () => void;
  onSignOut?: () => void;
  displayName?: string | null;
  unreadNotices?: number;
  busy: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  onMore: () => void;
};

function SidebarNavRow({
  icon,
  label,
  expanded,
  onPress,
  disabled = false,
  comingSoon = false,
  accessibilityLabel,
  badge,
  active = false,
}: {
  icon: ChatGptIconName;
  label: string;
  expanded: boolean;
  onPress: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
  accessibilityLabel?: string;
  badge?: number;
  active?: boolean;
}) {
  const { colors: c, isDark } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <View
      style={{ position: 'relative' }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: disabled || comingSoon }}
        disabled={disabled || comingSoon}
        onPress={onPress}
        style={({ pressed }) => ({
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: expanded ? 'flex-start' : 'center',
          paddingHorizontal: expanded ? 10 : 0,
          gap: 10,
          borderRadius: 8,
          backgroundColor: active
            ? c.selected
            : !disabled && !comingSoon && (pressed || hovered)
              ? c.hover
              : 'transparent',
          opacity: comingSoon ? 0.45 : disabled ? 0.45 : 1,
        })}
      >
        <View style={{ width: 20, alignItems: 'center', justifyContent: 'center' }}>
          <ChatGptIcon name={icon} size={17} color={comingSoon ? c.muted : c.text} />
        </View>
        {expanded && (
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: 14, color: comingSoon ? c.muted : c.text, fontWeight: '400' }}
          >
            {label}
          </Text>
        )}
        {expanded && !comingSoon && !!badge && badge > 0 && (
          <View
            style={{
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              paddingHorizontal: 5,
              backgroundColor: c.info,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text translate={false} style={{ color: '#ffffff', fontSize: 11, fontWeight: '600' }}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        )}
      </Pressable>
      {comingSoon && hovered && Platform.OS === 'web' && (
        <View
          testID="coming-soon-tooltip"
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: expanded ? 8 : undefined,
            left: expanded ? undefined : 46,
            top: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: isDark ? '#3a3a3a' : '#0d0d0d',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
            zIndex: 50,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#ffffff' }}>Coming soon</Text>
        </View>
      )}
    </View>
  );
}

export function ConversationSidebar(props: SidebarProps) {
  const { colors: c, isDark } = useTheme();
  const inset = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const transition = useSidebarTransition();
  const [menuTarget, setMenuTarget] = useState<{
    item: Conversation;
    left: number;
    top: number;
  } | null>(null);
  const [profileMenu, setProfileMenu] = useState(false);

  useEffect(() => {
    if (!menuTarget || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuTarget]);

  function openRowMenu(
    item: Conversation,
    target: { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null,
  ) {
    if (menuTarget?.item.id === item.id) {
      setMenuTarget(null);
      return;
    }
    const menuWidth = 160;
    const menuHeight = 124;
    if (target && typeof target.measureInWindow === 'function') {
      target.measureInWindow((x, y, w, h) => {
        const fitsRight = x + w + 8 + menuWidth <= winWidth - 8;
        const left = fitsRight ? x + w + 8 : Math.max(8, x + w - menuWidth);
        const top = Math.max(8, Math.min(fitsRight ? y - 4 : y + h + 4, winHeight - menuHeight - 8));
        setMenuTarget({ item, left, top });
      });
    } else {
      setMenuTarget({ item, left: props.mobile ? 132 : 264, top: 180 });
    }
  }

  const name = props.displayName?.trim() || 'Workspace';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const pinnedSet = useMemo(() => new Set(props.pinnedIds ?? []), [props.pinnedIds]);

  const grouped = useMemo(() => {
    const pinnedItems: Conversation[] = [];
    for (const id of props.pinnedIds ?? []) {
      const found = props.conversations.find((c) => c.id === id);
      if (found) pinnedItems.push(found);
    }
    const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
    const map = new Map<string, Conversation[]>();
    for (const item of props.conversations) {
      if (pinnedSet.has(item.id)) continue;
      const bucket = dateBucket(item.updated_at || item.created_at);
      const arr = map.get(bucket);
      if (arr) arr.push(item);
      else map.set(bucket, [item]);
    }
    const sections = order
      .filter((key) => map.has(key))
      .map((key) => ({ label: key, items: map.get(key)! }));
    if (pinnedItems.length) {
      return [{ label: 'Pinned', items: pinnedItems }, ...sections];
    }
    return sections;
  }, [props.conversations, props.pinnedIds, pinnedSet]);

  return (
    <View
      testID={props.mobile ? 'conversation-drawer' : 'conversation-sidebar'}
      style={[
        styles.sidebar,
        !props.mobile && transition,
        {
          width: props.mobile ? '100%' : props.expanded ? 260 : 52,
          backgroundColor: c.sidebar,
          borderRightWidth: props.mobile ? 0 : StyleSheet.hairlineWidth,
          borderRightColor: c.borderSubtle,
          overflow: 'hidden',
          paddingTop: props.mobile ? Math.max(inset.top, 8) : 8,
          paddingBottom: props.mobile ? Math.max(inset.bottom, 8) : 8,
          paddingHorizontal: props.expanded ? 8 : 6,
        },
      ]}
    >
      {/* Top header row */}
      <View
        style={[
          styles.topRow,
          {
            justifyContent: props.expanded ? 'space-between' : 'center',
            paddingHorizontal: props.expanded ? 4 : 0,
          },
        ]}
      >
        {props.expanded && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={BRAND_NAME}
            onPress={props.onNew}
            style={({ hovered }) => ({
              flex: 1,
              height: 36,
              paddingHorizontal: 8,
              borderRadius: 8,
              justifyContent: 'center',
              backgroundColor: hovered ? c.hover : 'transparent',
            })}
          >
            <Text
              translate={false}
              numberOfLines={1}
              style={{ fontSize: 14, fontWeight: '600', color: c.text }}
            >
              {BRAND_NAME}
            </Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {props.expanded && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search conversation history"
              onPress={props.onOpenSearch}
              style={({ pressed, hovered }) => [
                styles.iconButton,
                { backgroundColor: pressed || hovered ? c.hover : 'transparent' },
              ]}
            >
              <ChatGptIcon name="search" size={16} color={c.muted} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              props.mobile
                ? 'Close conversation history'
                : props.expanded
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
            <ChatGptIcon
              name={props.expanded ? 'sidebar' : 'sidebarHidden'}
              size={16}
              color={c.muted}
            />
          </Pressable>
        </View>
      </View>

      {/* Primary actions */}
      <View style={{ gap: 2, marginBottom: 8 }}>
        <SidebarNavRow
          icon="newChat"
          label="New chat"
          accessibilityLabel="New conversation"
          expanded={props.expanded}
          disabled={props.busy}
          onPress={props.onNew}
        />
        {!props.expanded && (
          <SidebarNavRow
            icon="search"
            label="Search chats"
            accessibilityLabel="Search conversation history"
            expanded={false}
            onPress={props.onOpenSearch}
          />
        )}
        {props.onWorkspace && (
          <>
            <SidebarNavRow
              icon="projects"
              label="Projects"
              expanded={props.expanded}
              active={props.activeSection === 'projects'}
              onPress={() => props.onWorkspace!('projects')}
            />
            <SidebarNavRow
              icon="library"
              label="Library"
              expanded={props.expanded}
              comingSoon
              onPress={() => {}}
            />
            <SidebarNavRow
              icon="scheduled"
              label="Scheduled"
              expanded={props.expanded}
              comingSoon
              onPress={() => {}}
            />
            <SidebarNavRow
              icon="bell"
              label="Notifications"
              expanded={props.expanded}
              comingSoon
              badge={props.unreadNotices}
              onPress={() => {}}
            />
          </>
        )}
      </View>

      {/* Date-grouped conversation list */}
      {props.expanded ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 14, paddingBottom: 12, paddingTop: 4 }}
          keyboardShouldPersistTaps="handled"
        >
          {grouped.map((group) => (
            <View key={group.label} style={{ gap: 2 }}>
              <Text
                accessibilityRole="header"
                style={{
                  color: c.subtle,
                  fontSize: 12,
                  fontWeight: '500',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                {group.label}
              </Text>
              {group.items.map((item) => {
                const selected = props.selectedId === item.id;
                const menuOpen = menuTarget?.item.id === item.id;
                return (
                  <View
                    key={item.id}
                    // @ts-expect-error web data attribute for hover CSS
                    dataSet={{ active: selected || menuOpen ? 'true' : 'false' }}
                    testID="sidebar-chat-row"
                    style={{
                      height: 36,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 8,
                      backgroundColor: selected || menuOpen ? c.selected : 'transparent',
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.title}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setMenuTarget(null);
                        props.onSelect(item.id);
                      }}
                      style={({ pressed, hovered }) => ({
                        flex: 1,
                        height: 36,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor:
                          !selected && !menuOpen && (pressed || hovered) ? c.hover : 'transparent',
                      })}
                    >
                      {pinnedSet.has(item.id) && (
                        <ChatGptIcon name="pin" size={12} color={c.muted} />
                      )}
                      <Text
                        translate={false}
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: c.text,
                          fontWeight: selected ? '500' : '400',
                        }}
                      >
                        {item.title}
                      </Text>
                    </Pressable>
                    {(props.onTogglePin || props.onRename || props.onDelete) && (
                      <Pressable
                        testID="sidebar-row-more"
                        accessibilityRole="button"
                        accessibilityLabel={`Actions for ${item.title}`}
                        onPress={(event) =>
                          openRowMenu(
                            item,
                            event.currentTarget as unknown as {
                              measureInWindow?: (
                                cb: (x: number, y: number, w: number, h: number) => void,
                              ) => void;
                            },
                          )
                        }
                        style={({ hovered }) => ({
                          width: 28,
                          height: 28,
                          marginRight: 4,
                          borderRadius: 6,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: hovered || menuOpen ? c.hover : 'transparent',
                        })}
                      >
                        <ChatGptIcon name="dots" size={14} color={c.muted} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
          {props.loading && (
            <FoolSpinner
              size={24}
              label="Loading conversations"
              style={{ alignSelf: 'center', marginTop: 12 }}
            />
          )}
          <ErrorNotice error={props.error} />
          {!props.loading && !props.error && !props.conversations.length && (
            <Text style={{ color: c.subtle, fontSize: 13, lineHeight: 20, paddingHorizontal: 10 }}>
              Your conversations will appear here.
            </Text>
          )}
          {props.hasMore && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More conversations"
              disabled={props.loadingMore}
              onPress={props.onMore}
              style={({ hovered }) => ({
                height: 36,
                justifyContent: 'center',
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: hovered ? c.hover : 'transparent',
              })}
            >
              <Text style={{ color: c.muted, fontSize: 13 }}>
                {props.loadingMore ? 'Loading…' : 'Show more'}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {/* Bottom sticky User Footer + Profile Popover */}
      <View style={{ position: 'relative' }}>
        {props.expanded && profileMenu && (
          <View
            testID="popover-menu"
            style={{
              marginBottom: 6,
              padding: 6,
              borderRadius: 14,
              backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
              borderWidth: 1,
              borderColor: c.border,
              gap: 2,
              ...(Platform.OS === 'web'
                ? {
                    boxShadow: isDark
                      ? '0 10px 30px rgba(0,0,0,0.5)'
                      : '0 8px 24px rgba(0,0,0,0.12)',
                  }
                : {}),
            }}
          >
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                setProfileMenu(false);
                props.onOpenSearch();
              }}
              style={({ hovered }) => [
                styles.menuItem,
                { backgroundColor: hovered ? c.hover : 'transparent' },
              ]}
            >
              <ChatGptIcon name="search" size={15} color={c.text} />
              <Text style={{ fontSize: 14, color: c.text }}>Search messages</Text>
            </Pressable>
            {props.onConnections && (
              <Pressable
                accessibilityRole="menuitem"
                onPress={() => {
                  setProfileMenu(false);
                  props.onConnections!();
                }}
                style={({ hovered }) => [
                  styles.menuItem,
                  { backgroundColor: hovered ? c.hover : 'transparent' },
                ]}
              >
                <ChatGptIcon name="globe" size={15} color={c.text} />
                <Text style={{ fontSize: 14, color: c.text }}>Connections</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="menuitem"
              onPress={() => {
                setProfileMenu(false);
                props.onSettings();
              }}
              style={({ hovered }) => [
                styles.menuItem,
                { backgroundColor: hovered ? c.hover : 'transparent' },
              ]}
            >
              <ChatGptIcon name="settings" size={15} color={c.text} />
              <Text style={{ fontSize: 14, color: c.text }}>Settings</Text>
            </Pressable>
            {props.onSignOut && (
              <>
                <View
                  style={{ height: 1, backgroundColor: c.borderSubtle, marginVertical: 4 }}
                />
                <Pressable
                  accessibilityRole="menuitem"
                  onPress={() => {
                    setProfileMenu(false);
                    props.onSignOut!();
                  }}
                  style={({ hovered }) => [
                    styles.menuItem,
                    { backgroundColor: hovered ? c.hover : 'transparent' },
                  ]}
                >
                  <Text style={{ fontSize: 14, color: c.text }}>Sign out</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
        <View
          style={{
            borderTopColor: c.borderSubtle,
            borderTopWidth: props.expanded ? StyleSheet.hairlineWidth : 0,
            paddingTop: 6,
            gap: 2,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.expanded ? `Account menu for ${name}` : 'Settings'}
            onPress={() => {
              if (props.expanded) setProfileMenu((v) => !v);
              else props.onSettings();
            }}
            style={({ pressed, hovered }) => [
              styles.footerRow,
              {
                justifyContent: props.expanded ? 'flex-start' : 'center',
                paddingHorizontal: props.expanded ? 8 : 0,
                backgroundColor: pressed || hovered ? c.hover : 'transparent',
              },
            ]}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: isDark ? '#7c3aed' : '#0d0d0d',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text translate={false} style={{ fontSize: 11, fontWeight: '600', color: '#ffffff' }}>
                {initials}
              </Text>
            </View>
            {props.expanded && (
              <View style={{ flex: 1, gap: 1 }}>
                <Text
                  translate={false}
                  numberOfLines={1}
                  style={{ fontSize: 13, fontWeight: '500', color: c.text }}
                >
                  {name}
                </Text>
                <Text style={{ fontSize: 11, color: c.subtle }}>OpenRouter</Text>
              </View>
            )}
          </Pressable>
          {props.expanded && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={props.onSettings}
              style={({ pressed, hovered }) => ({
                height: 34,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: pressed || hovered ? c.hover : 'transparent',
              })}
            >
              <View style={{ width: 28, alignItems: 'center' }}>
                <ChatGptIcon name="settings" size={16} color={c.muted} />
              </View>
              <Text style={{ fontSize: 13, color: c.muted }}>Settings</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Floating side menu for chat row actions (never shifts chat list) */}
      <Modal
        visible={!!menuTarget}
        transparent
        animationType="none"
        onRequestClose={() => setMenuTarget(null)}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            accessibilityLabel="Close menu"
            onPress={() => setMenuTarget(null)}
            style={StyleSheet.absoluteFill}
          />
          {menuTarget && (
            <View
              testID="popover-menu"
              style={{
                position: 'absolute',
                left: menuTarget.left,
                top: menuTarget.top,
                width: 160,
                padding: 5,
                borderRadius: 12,
                backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
                borderWidth: 1,
                borderColor: c.border,
                gap: 2,
                ...(Platform.OS === 'web'
                  ? {
                      boxShadow: isDark
                        ? '0 10px 30px rgba(0,0,0,0.55)'
                        : '0 8px 24px rgba(0,0,0,0.14)',
                    }
                  : {}),
              }}
            >
              {props.onTogglePin && (
                <Pressable
                  accessibilityRole="menuitem"
                  onPress={() => {
                    const target = menuTarget.item;
                    setMenuTarget(null);
                    props.onTogglePin!(target);
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
                  <ChatGptIcon name="pin" size={14} color={c.text} />
                  <Text style={{ fontSize: 13, color: c.text }}>
                    {pinnedSet.has(menuTarget.item.id) ? 'Unpin' : 'Pin'}
                  </Text>
                </Pressable>
              )}
              {props.onRename && (
                <Pressable
                  accessibilityRole="menuitem"
                  onPress={() => {
                    const target = menuTarget.item;
                    setMenuTarget(null);
                    props.onRename!(target);
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
                  <ChatGptIcon name="edit" size={14} color={c.text} />
                  <Text style={{ fontSize: 13, color: c.text }}>Rename</Text>
                </Pressable>
              )}
              {props.onDelete && (
                <Pressable
                  accessibilityRole="menuitem"
                  onPress={() => {
                    const target = menuTarget.item;
                    setMenuTarget(null);
                    props.onDelete!(target);
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
                  <ChatGptIcon name="trash" size={14} color={c.danger} />
                  <Text style={{ fontSize: 13, color: c.danger }}>Delete</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Modal>
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
          testID="drawer-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Dismiss conversation history"
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.55)' }]}
        />
        <View
          testID="drawer-panel"
          accessibilityViewIsModal
          style={{
            width: Math.min(300, width - 48),
            height: '100%',
            shadowColor: '#000',
            shadowOffset: { width: 6, height: 0 },
            shadowOpacity: 0.22,
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
  sidebar: { height: '100%' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    marginBottom: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
