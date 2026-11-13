import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Pressable, Text } from './locale-ui';
import { api } from './api';
import { ChatGptIcon } from './chatgpt-icons';
import { useTheme } from './theme';
import { Field } from './ui';
import type { Conversation } from './types';

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

export function SearchModal({
  visible,
  close,
  conversations,
  onSelectChat,
  onSelectMessage,
  onNewChat,
}: {
  visible: boolean;
  close: () => void;
  conversations: Conversation[];
  onSelectChat: (id: string) => void;
  onSelectMessage: (conversationId: string, messageId: string) => void;
  onNewChat: () => void;
}) {
  const { colors: c, isDark } = useTheme();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<ComponentRef<typeof Field>>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setDebounced('');
      return;
    }
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(focusTimer);
  }, [visible]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  const titleMatches = useQuery({
    queryKey: ['search-chats-modal', debounced],
    queryFn: () =>
      api<Conversation[]>(`/v1/conversations?limit=25&query=${encodeURIComponent(debounced)}`),
    enabled: visible && !!debounced,
  });

  const messageMatches = useQuery({
    queryKey: ['search-messages-modal', debounced],
    queryFn: () =>
      api<{ id: string; conversation_id: string; title: string; snippet: string }[]>(
        `/v1/search/messages?query=${encodeURIComponent(debounced)}&offset=0`,
      ),
    enabled: visible && debounced.length >= 2,
    retry: false,
  });

  const items = debounced ? (titleMatches.data ?? []) : conversations.slice(0, 20);
  const order = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older'];
  const grouped = order
    .map((label) => ({
      label,
      items: items.filter((item) => dateBucket(item.updated_at || item.created_at) === label),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingTop: 72,
          paddingHorizontal: 16,
          backgroundColor: isDark ? 'rgba(0, 0, 0, 0.58)' : 'rgba(0, 0, 0, 0.35)',
        }}
      >
        <Pressable
          accessibilityLabel="Close search"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View
          testID="search-modal"
          style={{
            width: '100%',
            maxWidth: 620,
            maxHeight: '76%',
            backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: c.border,
            overflow: 'hidden',
            ...(Platform.OS === 'web'
              ? {
                  boxShadow: isDark
                    ? '0 20px 60px rgba(0, 0, 0, 0.6)'
                    : '0 16px 48px rgba(0, 0, 0, 0.16)',
                }
              : {}),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              height: 54,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: c.border,
            }}
          >
            <ChatGptIcon name="search" size={17} color={c.muted} />
            <Field
              ref={inputRef}
              accessibilityLabel="Search chats and messages"
              placeholder="Search chats..."
              value={query}
              onChangeText={setQuery}
              style={{
                flex: 1,
                borderWidth: 0,
                backgroundColor: 'transparent',
                minHeight: 36,
                paddingHorizontal: 0,
                paddingVertical: 0,
                fontSize: 15,
                outlineWidth: 0,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              onPress={close}
              style={({ hovered }) => ({
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hovered ? c.hover : 'transparent',
              })}
            >
              <ChatGptIcon name="close" size={15} color={c.muted} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 10, gap: 10 }}
          >
            {!debounced && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  close();
                  onNewChat();
                }}
                style={({ hovered }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  height: 40,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: hovered ? c.hover : 'transparent',
                })}
              >
                <ChatGptIcon name="newChat" size={16} color={c.text} />
                <Text style={{ fontSize: 14, fontWeight: '500', color: c.text }}>New chat</Text>
              </Pressable>
            )}

            {grouped.map((group) => (
              <View key={group.label} style={{ gap: 2 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: c.subtle,
                    fontWeight: '500',
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                  }}
                >
                  {group.label}
                </Text>
                {group.items.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => {
                      close();
                      onSelectChat(item.id);
                    }}
                    style={({ hovered }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      height: 38,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: hovered ? c.hover : 'transparent',
                    })}
                  >
                    <Text
                      translate={false}
                      numberOfLines={1}
                      style={{ flex: 1, fontSize: 14, color: c.text }}
                    >
                      {item.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}

            {!!messageMatches.data?.length && (
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: c.subtle,
                    fontWeight: '500',
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                  }}
                >
                  Messages
                </Text>
                {messageMatches.data.map((hit) => (
                  <Pressable
                    key={hit.id}
                    accessibilityRole="button"
                    onPress={() => {
                      close();
                      onSelectMessage(hit.conversation_id, hit.id);
                    }}
                    style={({ hovered }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      gap: 2,
                      backgroundColor: hovered ? c.hover : 'transparent',
                    })}
                  >
                    <Text
                      translate={false}
                      numberOfLines={1}
                      style={{ fontSize: 13, fontWeight: '600', color: c.text }}
                    >
                      {hit.title}
                    </Text>
                    <Text
                      translate={false}
                      numberOfLines={2}
                      style={{ fontSize: 12, color: c.muted, lineHeight: 18 }}
                    >
                      {hit.snippet}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {!!debounced && !items.length && !messageMatches.data?.length && (
              <Text style={{ fontSize: 13, color: c.subtle, padding: 14, textAlign: 'center' }}>
                No matching chats.
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
