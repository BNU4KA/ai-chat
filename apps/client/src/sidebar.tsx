import { Pressable, Text } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
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
  busy?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  error?: unknown;
  hasMore?: boolean;
  unreadNotices?: number;
  displayName?: string | null;
  onToggle: () => void;
  onNew: () => void;
  onOpenSearch: () => void;
  onSelect: (id: string) => void;
  onMore?: () => void;
  onTogglePin?: (item: Conversation) => void;
  onRename?: (item: Conversation) => void;
  onDelete?: (item: Conversation) => void;
  onWorkspace?: (tab: 'projects' | 'documents' | 'schedules' | 'notices') => void;
  onConnections?: () => void;
  onSettings?: () => void;
  onSignOut?: () => void;
};

function SidebarNavRow({
  icon,
  label,
  accessibilityLabel,
  expanded,
  active,
  comingSoon,
  disabled,
  badge,
  onPress,
}: {
  icon: ChatGptIconName;
  label: string;
  accessibilityLabel?: string;
  expanded: boolean;
  active?: boolean;
  comingSoon?: boolean;
  disabled?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const { colors: c, isDark } = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: disabled || comingSoon, selected: !!active }}
        disabled={disabled || comingSoon}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={onPress}
        style={({ pressed }) => ({
          height: 36,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: expanded ? 10 : 0,
          justifyContent: expanded ? 'flex-start' : 'center',
          borderRadius: 8,
          backgroundColor:
            active || (!comingSoon && (pressed || hovered)) ? c.selected : 'transparent',
          opacity: comingSoon ? 0.38 : disabled ? 0.45 : 1,
          ...(Platform.OS === 'web' && comingSoon
            ? ({ cursor: 'not-allowed' } as Record<string, unknown>)
            : {}),
        })}
      >
        <View style={{ width: 20, alignItems: 'center', justifyContent: 'center' }}>
          <ChatGptIcon name={icon} size={17} color={comingSoon ? c.subtle : c.text} />
        </View>
        {expanded && (
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 14,
              color: comingSoon ? c.subtle : c.text,
              fontWeight: '400',
            }}
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
            zIndex: 999,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#ffffff' }}>Coming soon</Text>
        </View>
      )}
    </View>
  );
}

function ConversationSidebarView(props: SidebarProps) {
  const { colors: c } = useTheme();
  const inset = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const transition = useSidebarTransition();
  const [menuTarget, setMenuTarget] = useState<{
    item: Conversation;
    left: number;
    top: number;
  } | null>(null);
  const [profileMenu, setProfileMenu] = useState(false);
  const [kawasakiParty, setKawasakiParty] = useState(0);
  const [partyActive, setPartyActive] = useState(false);

  useEffect(() => {
    if (!partyActive) return;
    const t = setTimeout(() => setPartyActive(false), 950);
    return () => clearTimeout(t);
  }, [partyActive, kawasakiParty]);

  function triggerKawasaki() {
    setKawasakiParty((n) => n + 1);
    setPartyActive(true);
    props.onNew();
  }

  const pinnedSet = useMemo(() => new Set(props.pinnedIds ?? []), [props.pinnedIds]);

  const grouped = useMemo(() => {
    const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
    const map = new Map<string, Conversation[]>();
    const pinnedItems: Conversation[] = [];
    for (const item of props.conversations) {
      if (pinnedSet.has(item.id)) {
        pinnedItems.push(item);
        continue;
      }
      const key = dateBucket(item.updated_at);
      const arr = map.get(key);
      if (arr) arr.push(item);
      else map.set(key, [item]);
    }
    const sections = order
      .filter((key) => map.has(key))
      .map((key) => ({ label: key, items: map.get(key)! }));
    if (pinnedItems.length) {
      return [{ label: 'Pinned', items: pinnedItems }, ...sections];
    }
    return sections;
  }, [props.conversations, props.pinnedIds, pinnedSet]);

  function openRowMenu(
    item: Conversation,
    target?: {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    },
  ) {
    target?.measureInWindow?.((x, y, w, h) => {
      setMenuTarget({
        item,
        left: Math.min(Math.max(8, x + w - 168), winWidth - 176),
        top: Math.min(y + h + 4, winHeight - 160),
      });
    });
  }

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
          paddingTop: Math.max(8, inset.top),
          paddingBottom: Math.max(8, inset.bottom),
          paddingHorizontal: props.expanded ? 8 : 6,
        },
      ]}
    >
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
          <View style={{ flex: 1, position: 'relative' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={BRAND_NAME}
              onPress={triggerKawasaki}
              style={({ hovered }) => ({
                height: 36,
                paddingHorizontal: 8,
                borderRadius: 8,
                justifyContent: 'center',
                backgroundColor: hovered ? c.hover : 'transparent',
              })}
            >
              <Text
                key={kawasakiParty}
                testID={partyActive ? 'kawasaki-party' : undefined}
                translate={false}
                numberOfLines={1}
                style={{ fontSize: 14, fontWeight: '600', color: c.text }}
              >
                {BRAND_NAME}
              </Text>
            </Pressable>
          </View>
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingTop: 0, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 2, marginBottom: 4 }}>
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
                comingSoon
                onPress={() => {}}
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

        {props.expanded ? (
          <View style={{ gap: 14 }}>
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
          </View>
        ) : (
          <View style={{ flex: 1, minHeight: 12 }} />
        )}
      </ScrollView>

      <View style={{ position: 'relative' }}>
        {props.expanded && profileMenu && (
          <View
            testID="popover-menu"
            style={{
              marginBottom: 6,
              padding: 6,
              borderRadius: 14,
              backgroundColor: c.raised,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.border,
              gap: 2,
            }}
          >
            {props.onSettings && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                onPress={() => {
                  setProfileMenu(false);
                  props.onSettings?.();
                }}
                style={({ hovered }) => [styles.menuItem, { backgroundColor: hovered ? c.hover : 'transparent' }]}
              >
                <ChatGptIcon name="settings" size={15} color={c.text} />
                <Text style={{ fontSize: 13, color: c.text }}>Settings</Text>
              </Pressable>
            )}
            {props.onConnections && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Connections"
                onPress={() => {
                  setProfileMenu(false);
                  props.onConnections?.();
                }}
                style={({ hovered }) => [styles.menuItem, { backgroundColor: hovered ? c.hover : 'transparent' }]}
              >
                <ChatGptIcon name="globe" size={15} color={c.text} />
                <Text style={{ fontSize: 13, color: c.text }}>Connections</Text>
              </Pressable>
            )}
            {props.onSignOut && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                onPress={() => {
                  setProfileMenu(false);
                  props.onSignOut?.();
                }}
                style={({ hovered }) => [styles.menuItem, { backgroundColor: hovered ? c.hover : 'transparent' }]}
              >
                <Text style={{ fontSize: 13, color: c.danger }}>Sign out</Text>
              </Pressable>
            )}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.displayName ?? 'Account menu'}
          onPress={() => setProfileMenu((v) => !v)}
          style={({ hovered }) => [
            styles.footerRow,
            {
              paddingHorizontal: props.expanded ? 8 : 0,
              justifyContent: props.expanded ? 'flex-start' : 'center',
              backgroundColor: hovered || profileMenu ? c.hover : 'transparent',
            },
          ]}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: c.control,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text translate={false} style={{ fontSize: 12, fontWeight: '600', color: c.text }}>
              {(props.displayName ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          {props.expanded && (
            <Text translate={false} numberOfLines={1} style={{ flex: 1, fontSize: 13, color: c.text }}>
              {props.displayName ?? 'Account'}
            </Text>
          )}
          {props.expanded && <ChatGptIcon name="settings" size={16} color={c.muted} />}
        </Pressable>
      </View>

      <Modal visible={!!menuTarget} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuTarget(null)} />
        {menuTarget && (
          <View
            style={{
              position: 'absolute',
              left: menuTarget.left,
              top: menuTarget.top,
              width: 168,
              padding: 6,
              borderRadius: 12,
              backgroundColor: c.raised,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.border,
              gap: 2,
            }}
          >
            {props.onTogglePin && (
              <Pressable
                onPress={() => {
                  props.onTogglePin?.(menuTarget.item);
                  setMenuTarget(null);
                }}
                style={({ hovered }) => [styles.menuItem, { backgroundColor: hovered ? c.hover : 'transparent' }]}
              >
                <ChatGptIcon name="pin" size={14} color={c.text} />
                <Text style={{ fontSize: 13, color: c.text }}>
                  {pinnedSet.has(menuTarget.item.id) ? 'Unpin' : 'Pin'}
                </Text>
              </Pressable>
            )}
            {props.onRename && (
              <Pressable
                onPress={() => {
                  props.onRename?.(menuTarget.item);
                  setMenuTarget(null);
                }}
                style={({ hovered }) => [styles.menuItem, { backgroundColor: hovered ? c.hover : 'transparent' }]}
              >
                <ChatGptIcon name="edit" size={14} color={c.text} />
                <Text style={{ fontSize: 13, color: c.text }}>Rename</Text>
              </Pressable>
            )}
            {props.onDelete && (
              <Pressable
                onPress={() => {
                  props.onDelete?.(menuTarget.item);
                  setMenuTarget(null);
                }}
                style={({ hovered }) => [styles.menuItem, { backgroundColor: hovered ? c.hover : 'transparent' }]}
              >
                <ChatGptIcon name="trash" size={14} color={c.danger} />
                <Text style={{ fontSize: 13, color: c.danger }}>Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      </Modal>
    </View>
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

export const ConversationSidebar = memo(ConversationSidebarView);
