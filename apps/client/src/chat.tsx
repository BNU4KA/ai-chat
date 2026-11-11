import { useLocale } from './locale';
import { Pressable, Text } from './locale-ui';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { api, apiEnvelope, json } from './api';
import { useTheme } from './theme';
import { useCredential, useCapabilities, useModels, useProfile } from './queries';
import { useRun, activeStatus } from './use-run';
import { Button, Copy, ErrorNotice, Field, Loading, Panel } from './ui';
import { Dialog } from './dialog';
import { ConversationSidebar, ConversationDrawer, MenuMark, useSidebarTransition } from './sidebar';
import { Markdown } from './markdown';
import { ApprovalCard } from './approval';
import { Attachment } from './attachment';
import { MessageActions } from './message-actions';
import { TarotBackground } from './tarot-background';
import { ComposerFrame } from './composer-frame';
import { FoolSpinner } from './fool-spinner';
import { ThinkingTrace } from './thinking';
import { pickFile, uploadPicked } from './upload';
import type { Conversation, Message, Model, Run, FileRecord } from './types';
type Group = 'web' | 'files' | 'gmail' | 'calendar';
const groupLabels: Record<Group, string> = {
  web: 'Web research',
  files: 'Photos & files',
  gmail: 'Gmail',
  calendar: 'Google Calendar',
};
export function ChatWorkspace({ id: routeId }: { id?: string }) {
  const { t, language } = useLocale();
  const [createdChat, setCreatedChat] = useState<Conversation | null>(null);
  const [homeModel, setHomeModel] = useState('google/gemini-3.8-flash');
  const id = routeId ?? createdChat?.id;
  const router = useRouter();
  const cache = useQueryClient();
  const { colors: c, isDark, setChoice } = useTheme();
  const width = useWindowDimensions().width;
  const wide = width >= 1024;
  const sidebarTransition = useSidebarTransition();
  const [drawer, setDrawer] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarSearchFocused, setSidebarSearchFocused] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ id: string; name: string }[]>([]);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const [managed, setManaged] = useState<Conversation | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [dialog, setDialog] = useState<
    'models' | 'tools' | 'rename' | 'delete' | 'retry' | 'files' | null
  >(null);
  const [modelSearch, setModelSearch] = useState('');
  const [title, setTitle] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const pending = useRef<{ body: string; key: string; clientId: string } | null>(null);
  const sending = useRef(false);
  const creating = useRef<Promise<string> | null>(null);
  const profile = useProfile();
  const credential = useCredential();
  const capabilities = useCapabilities();
  const models = useModels(!!credential.data?.configured);
  useEffect(() => {
    if (profile.data) setChoice(profile.data.theme);
  }, [profile.data, setChoice]);
  useEffect(() => {
    setDraft('');
    setSelectedFiles([]);
    setError(null);
    pending.current = null;
    setPendingMessage((current) =>
      current && routeId && current.conversation_id !== routeId ? null : current,
    );
    setAtBottom(true);
  }, [routeId]);
  const history = useInfiniteQuery({
    queryKey: ['conversations', search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiEnvelope<Conversation[]>(
        `/v1/conversations?limit=30&query=${encodeURIComponent(search)}${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: 5000,
  });
  const chat = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api<Conversation>(`/v1/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 5000,
  });
  const messages = useInfiniteQuery({
    queryKey: ['messages', id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiEnvelope<Message[]>(
        `/v1/conversations/${id}/messages?tail=true&limit=50${pageParam ? '&before_seq=' + pageParam : ''}`,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: !!id,
  });
  const runs = useQuery({
    queryKey: ['runs', id],
    queryFn: () => api<Run[]>(`/v1/conversations/${id}/runs?limit=30`),
    enabled: !!id,
    refetchInterval: 5000,
  });
  const files = useQuery({
    queryKey: ['files', id],
    queryFn: () => api<FileRecord[]>(`/v1/conversations/${id}/files`),
    enabled: !!id,
    refetchInterval: 5000,
  });
  const latest = runs.data?.[0];
  const snapshot = useRun(latest?.id);
  const running = !!latest && activeStatus(snapshot.data?.run.status ?? latest.status);
  const currentModel = models.data?.find(
    (model) => model.id === (chat.data?.model_id ?? homeModel),
  );
  const incompatible =
    !!currentModel && !currentModel.supports_tools && !!chat.data?.enabled_tools.length;
  const imageIncompatible =
    !!currentModel &&
    !currentModel.supports_images &&
    (files.data ?? []).some(
      (file) =>
        file.detected_mime?.startsWith('image/') &&
        (selectedFiles.includes(file.id) || listHasFile(file.id)),
    );
  function listHasFile(fileId: string) {
    return (
      messages.data?.pages.some((page) =>
        page.data.some((message) => message.file_ids.includes(fileId)),
      ) ?? false
    );
  }
  const list =
    messages.data?.pages
      .slice()
      .reverse()
      .flatMap((page) => page.data) ?? [];
  const visibleMessages = list.map((message) =>
    message.id === snapshot.data?.assistant_message.id ? snapshot.data!.assistant_message : message,
  );
  if (
    snapshot.data &&
    !visibleMessages.some((message) => message.id === snapshot.data!.assistant_message.id)
  )
    visibleMessages.push(snapshot.data.assistant_message);
  const shown =
    pendingMessage && !visibleMessages.some((message) => message.id === pendingMessage.id)
      ? [...visibleMessages, pendingMessage]
      : visibleMessages;
  async function ensureChat() {
    if (id) return id;
    if (creating.current) return creating.current;
    creating.current = (async () => {
      const value = await api<Conversation>(
        '/v1/conversations',
        json('POST', { model_id: homeModel }),
      );
      cache.setQueryData(['conversation', value.id], value);
      setCreatedChat(value);
      void cache.invalidateQueries({ queryKey: ['conversations'] });
      return value.id;
    })();
    try {
      return await creating.current;
    } catch (error) {
      creating.current = null;
      throw error;
    }
  }
  async function createChat() {
    creating.current = null;
    setCreatedChat(null);
    setDraft('');
    setSelectedFiles([]);
    setError(null);
    setDrawer(false);
    router.replace('/');
  }
  async function patch(body: Partial<Conversation>) {
    const target = managed ?? chat.data;
    if (!target) {
      if (body.model_id) setHomeModel(body.model_id);
      setDialog(null);
      setManaged(null);
      return;
    }
    try {
      const value = await api<Conversation>(
        `/v1/conversations/${target.id}`,
        json('PATCH', body, target.version),
      );
      cache.setQueryData(['conversation', target.id], value);
      void cache.invalidateQueries({ queryKey: ['conversations'] });
      setDialog(null);
      setManaged(null);
    } catch (e) {
      setError(e);
      void chat.refetch();
    }
  }
  async function send() {
    if (
      sending.current ||
      running ||
      !credential.data?.configured ||
      !(chat.data?.model_id ?? homeModel) ||
      incompatible ||
      imageIncompatible ||
      !fileReady ||
      (!draft.trim() && !selectedFiles.length)
    )
      return;
    const text = draft;
    const fileIds = selectedFiles.slice();
    const body = JSON.stringify({ text, file_ids: fileIds });
    if (pending.current?.body !== body)
      pending.current = { body, key: Crypto.randomUUID(), clientId: Crypto.randomUUID() };
    const saved = pending.current;
    if (!saved) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setDraft('');
    setSelectedFiles([]);
    setPendingMessage({
      id: saved.clientId,
      conversation_id: id ?? '00000000-0000-4000-8000-000000000000',
      run_id: null,
      seq: '0',
      role: 'user',
      content: text,
      status: 'complete',
      file_ids: fileIds,
      created_at: new Date().toISOString(),
    });
    setAtBottom(true);
    try {
      const targetId = await ensureChat();
      setPendingMessage((current) =>
        current?.id === saved.clientId ? { ...current, conversation_id: targetId } : current,
      );
      const value = await api<{ run: Run }>(
        `/v1/conversations/${targetId}/messages`,
        json(
          'POST',
          { client_message_id: saved.clientId, text, file_ids: fileIds },
          undefined,
          saved.key,
        ),
      );
      pending.current = null;
      cache.setQueryData(['runs', targetId], (old: Run[] | undefined) => [
        value.run,
        ...(old ?? []),
      ]);
      await cache.invalidateQueries({ queryKey: ['messages', targetId] });
      setPendingMessage(null);
      if (!routeId) router.replace(`/chat/${targetId}`);
      void cache.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      setDraft(text);
      setSelectedFiles(fileIds);
      setPendingMessage(null);
      setError(e);
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }
  async function stop() {
    if (!latest) return;
    try {
      await api(`/v1/runs/${latest.id}/cancel`, json('POST', {}));
      await cache.invalidateQueries({ queryKey: ['run', latest.id] });
    } catch (e) {
      setError(e);
    }
  }
  async function retry() {
    setDialog(null);
    const user = [...visibleMessages].reverse().find((message) => message.role === 'user');
    if (!user) return;
    setBusy(true);
    try {
      await api(`/v1/messages/${user.id}/retry`, json('POST', {}, undefined, Crypto.randomUUID()));
      await cache.invalidateQueries({ queryKey: ['runs', id] });
      await cache.invalidateQueries({ queryKey: ['messages', id] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    setError(null);
    const picked = await pickFile().catch((e: unknown) => {
      setError(e);
      return null;
    });
    if (!picked) return;
    const localId = Crypto.randomUUID();
    setPendingFiles((old) => [...old, { id: localId, name: picked.name }]);
    try {
      const file = await uploadPicked(picked, ensureChat);
      const targetId = file.conversation_id;
      setSelectedFiles((old) => [...old, file.id]);
      cache.setQueryData(['files', targetId], (old: FileRecord[] | undefined) => [
        file,
        ...(old ?? []).filter((item) => item.id !== file.id),
      ]);
      await cache.invalidateQueries({ queryKey: ['files', targetId] });
    } catch (e) {
      setError(e);
    } finally {
      setPendingFiles((old) => old.filter((item) => item.id !== localId));
    }
  }
  async function removeChat() {
    const target = managed ?? chat.data;
    if (!target) return;
    try {
      await api(`/v1/conversations/${target.id}`, json('DELETE', undefined, target.version));
      setDialog(null);
      setManaged(null);
      await cache.invalidateQueries({ queryKey: ['conversations'] });
      if (target.id === id) router.replace('/');
    } catch (e) {
      setError(e);
    }
  }
  const fileReady = selectedFiles.every((fileId) =>
    files.data?.some((file) => file.id === fileId && file.status === 'ready'),
  );
  const composerInk = isDark ? '#ffffff' : c.text;
  const sendLocked =
    busy ||
    pendingFiles.length > 0 ||
    !credential.data?.configured ||
    !(chat.data?.model_id ?? homeModel) ||
    incompatible ||
    imageIncompatible ||
    !fileReady ||
    (!draft.trim() && !selectedFiles.length);
  const composer = (
    <View
      style={{
        width: '100%',
        maxWidth: 856,
        alignSelf: 'center',
        padding: wide ? 20 : 12,
        gap: 8,
      }}
    >
      {snapshot.reconnecting && (
        <Copy small muted>
          Connection interrupted. Reconnecting…
        </Copy>
      )}
      {!credential.data?.configured && (
        <Button secondary onPress={() => router.push('/onboarding/key')}>
          Add your OpenRouter key to send a message
        </Button>
      )}
      {incompatible && (
        <ErrorNotice error="This model does not support the selected tools. Choose another model or turn off tools." />
      )}
      {(!!selectedFiles.length || !!pendingFiles.length) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {pendingFiles.map((file) => (
            <View
              key={file.id}
              style={{
                maxWidth: 220,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: c.border,
                paddingHorizontal: 12,
                paddingVertical: 8,
                gap: 2,
              }}
            >
              <Text translate={false} numberOfLines={1} style={{ color: c.text, fontSize: 13 }}>
                {file.name}
              </Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>Uploading…</Text>
            </View>
          ))}
          {selectedFiles.map((fileId) => (
            <Attachment
              key={fileId}
              id={fileId}
              file={files.data?.find((file) => file.id === fileId)}
              compact
              onRemove={() => setSelectedFiles((old) => old.filter((value) => value !== fileId))}
            />
          ))}
        </View>
      )}

      <ComposerFrame focused={composerFocused}>
        <Field
          accessibilityLabel="Message"
          placeholder="Ask AI Chat"
          value={draft}
          onChangeText={setDraft}
          multiline
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          style={{
            borderWidth: 0,
            minHeight: 64,
            maxHeight: 180,
            backgroundColor: 'transparent',
            outlineWidth: 0,
            paddingHorizontal: 8,
          }}
          onKeyPress={(event) => {
            if (Platform.OS === 'web') {
              const key = event.nativeEvent as unknown as {
                key: string;
                shiftKey?: boolean;
                isComposing?: boolean;
              };
              if (key.key === 'Enter' && !key.shiftKey && !key.isComposing) {
                event.preventDefault();
                void send();
              }
            }
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable
            testID="composer-attach"
            accessibilityRole="button"
            accessibilityLabel="Attach photos or files"
            disabled={
              pendingFiles.length > 0 ||
              running ||
              selectedFiles.length >= 5 ||
              capabilities.data?.tools.files !== 'available'
            }
            onPress={() => void upload()}
            style={({ pressed, hovered }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed || hovered ? c.hover : 'transparent',
              opacity: pendingFiles.length > 0 ? 0.45 : 1,
            })}
          >
            <Text style={{ color: composerInk, fontSize: 18, lineHeight: 20 }}>＋</Text>
          </Pressable>
          <Pressable
            testID="composer-tools"
            accessibilityRole="button"
            accessibilityLabel="Choose tools"
            onPress={() =>
              void ensureChat()
                .then(() => {
                  setManaged(null);
                  setDialog('tools');
                })
                .catch(setError)
            }
            style={({ pressed, hovered }) => ({
              minHeight: 32,
              paddingHorizontal: 12,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed || hovered ? c.hover : 'transparent',
            })}
          >
            <Text style={{ color: composerInk, fontSize: 13, fontWeight: '600' }}>Tools</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            testID="composer-model"
            accessibilityRole="button"
            accessibilityLabel="Choose model"
            onPress={() => {
              setManaged(null);
              setDialog('models');
            }}
            style={({ pressed, hovered }) => ({
              minHeight: 32,
              maxWidth: wide ? 200 : 120,
              flexShrink: 1,
              borderRadius: 16,
              paddingHorizontal: 12,
              justifyContent: 'center',
              backgroundColor: pressed || hovered ? c.hover : 'transparent',
            })}
          >
            <Text numberOfLines={1} style={{ color: composerInk, fontSize: 13 }}>
              {(currentModel?.name ?? 'Gemini 3.8 Flash').replace('Google: ', '')} ▾
            </Text>
          </Pressable>
          {running ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop"
              onPress={() => void stop()}
              style={{
                minHeight: 32,
                paddingHorizontal: 12,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.danger,
              }}
            >
              <Text style={{ color: c.dangerText, fontSize: 13, fontWeight: '600' }}>Stop</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="composer-send"
              accessibilityRole="button"
              accessibilityLabel="Send ↑"
              disabled={sendLocked}
              onPress={() => void send()}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? c.hover : 'transparent',
                opacity: sendLocked ? 0.4 : 1,
              })}
            >
              <Text style={{ fontSize: 16, color: composerInk }}>↑</Text>
            </Pressable>
          )}
        </View>
      </ComposerFrame>
      {imageIncompatible && (
        <ErrorNotice error="This model cannot see photos. Choose a model with photo support." />
      )}
      <ErrorNotice error={error} />
      <Text
        style={{
          textAlign: 'center',
          color: c.quiet,
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        Uses your OpenRouter balance. Review external actions before confirming.
      </Text>
    </View>
  );
  const sidebar = (mobile = false) => (
    <ConversationSidebar
      mobile={mobile}
      expanded={mobile || sidebarExpanded || sidebarHovered || sidebarSearchFocused}
      pinned={sidebarExpanded}
      onSearchFocus={() => setSidebarSearchFocused(true)}
      onSearchBlur={() => setSidebarSearchFocused(false)}
      selectedId={id}
      conversations={history.data?.pages.flatMap((page) => page.data) ?? []}
      search={search}
      onSearch={setSearch}
      onToggle={() => {
        if (mobile) setDrawer(false);
        else {
          setSidebarExpanded((value) => !value);
          setSidebarHovered(false);
          setSidebarSearchFocused(false);
        }
      }}
      onNew={() => void createChat()}
      onSelect={(conversationId) => {
        router.replace(`/chat/${conversationId}`);
        setDrawer(false);
      }}
      onRename={(item) => {
        setManaged(item);
        setTitle(item.title);
        setDialog('rename');
      }}
      onDelete={(item) => {
        setManaged(item);
        setDialog('delete');
      }}
      onSettings={() => {
        setDrawer(false);
        router.push('/settings');
      }}
      displayName={profile.data?.display_name}
      busy={busy || pendingFiles.length > 0}
      loading={history.isPending}
      loadingMore={history.isFetchingNextPage}
      error={history.error}
      hasMore={!!history.hasNextPage}
      onMore={() => void history.fetchNextPage()}
    />
  );
  if (id && chat.isPending) return <Loading />;
  if (id && chat.isError)
    return (
      <View style={{ flex: 1, backgroundColor: c.background, padding: 24, gap: 20 }}>
        <Copy>Conversation not found or temporarily unavailable.</Copy>
        <ErrorNotice error={chat.error} />
        <Button onPress={() => router.replace('/')}>Back to conversations</Button>
      </View>
    );
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.background }}>
      {wide && (
        <View
          onPointerEnter={(event) => {
            if (Platform.OS === 'web' && event.nativeEvent.pointerType === 'mouse')
              setSidebarHovered(true);
          }}
          onPointerLeave={() => setSidebarHovered(false)}
          style={[
            { width: sidebarExpanded ? 280 : 72, flexShrink: 0, zIndex: 20 },
            sidebarTransition,
          ]}
        >
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0 }}>{sidebar()}</View>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            minHeight: 72,
            paddingHorizontal: wide ? 28 : 16,
            paddingVertical: 12,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
            borderBottomWidth: 0,
            borderColor: c.border,
            backgroundColor: c.background,
          }}
        >
          {!wide && (
            <Button secondary label="Open conversation history" onPress={() => setDrawer(true)}>
              <MenuMark color={c.cardInk} />
            </Button>
          )}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: c.text, fontWeight: '500', fontSize: 22 }}>
              AI Chat
            </Text>
            <Text style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>
              {running ? 'Agent is working' : (chat.data?.title ?? 'Your workspace')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: c.accentText, fontWeight: '600', fontSize: 16 }}>
              {(profile.data?.display_name ?? 'A').slice(0, 1).toUpperCase()}
            </Text>
          </Pressable>
        </View>
        {!routeId && !shown.length ? (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TarotBackground />
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                padding: wide ? 28 : 16,
                paddingBottom: wide ? 100 : 28,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  width: '100%',
                  maxWidth: 760,
                  gap: 8,
                  marginBottom: 24,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: wide ? 44 : 32,
                    lineHeight: wide ? 56 : 42,
                    fontWeight: '400',
                    letterSpacing: -1,
                    color: c.greeting,
                  }}
                >
                  Hello, {profile.data?.display_name?.split(' ')[0] ?? 'there'}
                </Text>
                <Text
                  style={{
                    fontSize: wide ? 34 : 25,
                    lineHeight: wide ? 44 : 34,
                    fontWeight: '400',
                    color: c.muted,
                    textAlign: 'center',
                  }}
                >
                  What’s on your mind?
                </Text>
              </View>
              {composer}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginTop: 16,
                }}
              >
                {['Summarize a document', 'Explain a photo', 'Help me write'].map((prompt) => (
                  <Pressable
                    key={prompt}
                    accessibilityRole="button"
                    onPress={() => setDraft(t(prompt))}
                    style={({ pressed, hovered }) => ({
                      paddingHorizontal: 18,
                      paddingVertical: 12,
                      borderRadius: 22,
                      borderWidth: 1,
                      borderColor: c.cardEdge,
                      backgroundColor: pressed || hovered ? c.cardPressed : c.card,
                    })}
                  >
                    <Text style={{ fontSize: 14, color: c.cardInk }}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              ref={scroll}
              style={{ flex: 1 }}
              contentContainerStyle={{
                padding: wide ? 28 : 16,
                gap: 26,
                maxWidth: 856,
                width: '100%',
                alignSelf: 'center',
              }}
              onScroll={(event) => {
                const n = event.nativeEvent;
                setAtBottom(
                  n.contentOffset.y + n.layoutMeasurement.height >= n.contentSize.height - 100,
                );
              }}
              scrollEventThrottle={150}
              onContentSizeChange={() => {
                if (atBottom) scroll.current?.scrollToEnd({ animated: false });
              }}
            >
              {messages.hasNextPage && (
                <Button secondary onPress={() => void messages.fetchNextPage()}>
                  Load earlier messages
                </Button>
              )}
              {!shown.length && (
                <View style={{ paddingVertical: wide ? 80 : 40, gap: 20 }}>
                  <Text
                    style={{
                      fontSize: wide ? 42 : 30,
                      fontWeight: '400',
                      letterSpacing: -1,
                      color: c.greeting,
                    }}
                  >
                    Start with a thought.
                  </Text>
                  <Copy muted>Ask a question, research a topic, or attach a document.</Copy>
                  {[
                    'Help me think through an idea',
                    'Find recent sources about a topic',
                    'Summarize a document',
                  ].map((prompt) => (
                    <Button key={prompt} secondary onPress={() => setDraft(t(prompt))}>
                      {prompt}
                    </Button>
                  ))}
                </View>
              )}
              {shown.map((message) => (
                <View
                  key={message.id}
                  testID="chat-message"
                  style={{
                    alignSelf: message.role === 'user' ? 'flex-end' : 'stretch',
                    maxWidth: message.role === 'user' ? '90%' : '100%',
                    gap: 8,
                  }}
                >
                  <View
                    testID={
                      message.role === 'user' ? 'user-message-bubble' : 'assistant-message-body'
                    }
                    style={{
                      gap: 8,
                      padding: message.role === 'user' ? 16 : 0,
                      borderRadius: 24,
                      backgroundColor: message.role === 'user' ? c.composer : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: c.muted }}>
                      {message.role === 'user' ? 'YOU' : 'AI CHAT'} ·{' '}
                      {new Date(message.created_at).toLocaleTimeString(
                        language === 'ru' ? 'ru-RU' : 'en-US',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )}
                    </Text>
                    {message.role === 'assistant' &&
                      message.id === snapshot.data?.assistant_message.id && (
                        <ThinkingTrace
                          running={running && message.status === 'pending'}
                          tools={snapshot.data.tool_calls}
                          startedAt={snapshot.data.run.created_at}
                          finishedAt={snapshot.data.run.finished_at}
                        />
                      )}
                    {message.content ? (
                      <Markdown
                        text={message.content}
                        smooth={
                          message.role === 'assistant' &&
                          running &&
                          message.id === snapshot.data?.assistant_message.id
                        }
                      />
                    ) : message.status === 'pending' &&
                      message.id !== snapshot.data?.assistant_message.id ? (
                      <ThinkingTrace running tools={[]} />
                    ) : null}
                    {message.file_ids.map((fileId) => (
                      <Attachment
                        key={fileId}
                        id={fileId}
                        file={files.data?.find((file) => file.id === fileId)}
                        onOpen={() =>
                          void api<{ url: string }>(`/v1/files/${fileId}/download`)
                            .then((value) => Linking.openURL(value.url))
                            .catch(setError)
                        }
                      />
                    ))}
                    {['partial', 'failed', 'cancelled'].includes(message.status) && (
                      <Copy small muted>
                        {message.status === 'cancelled'
                          ? 'Cancelled — partial response'
                          : message.status === 'failed'
                            ? 'Response failed'
                            : 'Incomplete response'}
                      </Copy>
                    )}
                  </View>
                  {(message.content ||
                    (message.role === 'assistant' && message.status !== 'pending')) && (
                    <MessageActions
                      text={message.content}
                      assistant={message.role === 'assistant'}
                      canRetry={
                        !running &&
                        message.id ===
                          (snapshot.data?.run.assistant_message_id ?? latest?.assistant_message_id)
                      }
                      busy={busy}
                      onRetry={() => setDialog('retry')}
                      onError={setError}
                    />
                  )}
                </View>
              ))}
              {snapshot.data?.approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
              {snapshot.data?.run.error_code && (
                <ErrorNotice
                  error={new Error(snapshot.data.run.error_code.replaceAll('_', ' ').toLowerCase())}
                />
              )}
              <ErrorNotice error={messages.error ?? runs.error} />
            </ScrollView>
            {!atBottom && (
              <View style={{ alignSelf: 'center', margin: 8 }}>
                <Button
                  secondary
                  onPress={() => {
                    setAtBottom(true);
                    scroll.current?.scrollToEnd();
                  }}
                >
                  Jump to latest ↓
                </Button>
              </View>
            )}
            {composer}
          </KeyboardAvoidingView>
        )}
      </View>
      <ConversationDrawer visible={drawer && !wide} close={() => setDrawer(false)}>
        {sidebar(true)}
      </ConversationDrawer>
      <Dialog title="Choose a model" visible={dialog === 'models'} close={() => setDialog(null)}>
        <Field
          accessibilityLabel="Search models"
          placeholder="Search models"
          value={modelSearch}
          onChangeText={setModelSearch}
        />
        <ErrorNotice error={models.error} />
        {models.isPending && credential.data?.configured && (
          <FoolSpinner size={28} label="Loading models" />
        )}
        <ModelList
          models={(models.data ?? [])
            .filter((m) => `${m.name} ${m.id}`.toLowerCase().includes(modelSearch.toLowerCase()))
            .slice(0, 60)}
          selected={chat.data?.model_id ?? homeModel}
          onSelect={(model) => void patch({ model_id: model.id })}
        />
      </Dialog>
      <Dialog
        title="Tools & conversation"
        visible={dialog === 'tools'}
        close={() => setDialog(null)}
      >
        <Button secondary onPress={() => setDialog('files')}>
          Conversation files
        </Button>
        <Copy small muted>
          Changes apply to the next run. Connect Google services in Settings.
        </Copy>
        {(Object.keys(groupLabels) as Group[]).map((group) => {
          const enabled = chat.data?.enabled_tools.includes(group);
          const available = capabilities.data?.tools[group] === 'available';
          return (
            <Button
              key={group}
              secondary
              disabled={!available && !enabled}
              onPress={() =>
                void patch({
                  enabled_tools: enabled
                    ? chat.data!.enabled_tools.filter((g) => g !== group)
                    : [...chat.data!.enabled_tools, group],
                })
              }
            >
              {enabled ? '✓ ' : ''}
              {groupLabels[group]}
              {!available ? ' · not connected' : ''}
            </Button>
          );
        })}
        <Button
          secondary
          onPress={() => {
            setManaged(chat.data ?? null);
            setTitle(chat.data?.title ?? '');
            setDialog('rename');
          }}
        >
          Rename conversation
        </Button>
        <Button
          danger
          onPress={() => {
            setManaged(chat.data ?? null);
            setDialog('delete');
          }}
        >
          Delete conversation
        </Button>
      </Dialog>
      <Dialog
        title="Rename conversation"
        visible={dialog === 'rename'}
        close={() => {
          setDialog(null);
          setManaged(null);
        }}
      >
        <Field accessibilityLabel="Conversation title" value={title} onChangeText={setTitle} />
        <Button disabled={!title.trim()} onPress={() => void patch({ title: title.trim() })}>
          Save title
        </Button>
      </Dialog>
      <Dialog
        title="Delete conversation?"
        visible={dialog === 'delete'}
        close={() => {
          setDialog(null);
          setManaged(null);
        }}
      >
        <Copy>
          Tasks will stop and this conversation and its documents will be removed. Private upload
          links may take up to two hours to expire before physical cleanup finishes.
        </Copy>
        <Button danger onPress={() => void removeChat()}>
          Delete conversation
        </Button>
      </Dialog>
      <Dialog title="Retry response?" visible={dialog === 'retry'} close={() => setDialog(null)}>
        <Copy>
          This starts a new model request using your OpenRouter balance. The previous attempt stays
          in history.
        </Copy>
        <Button onPress={() => void retry()}>Start new attempt</Button>
      </Dialog>
      <Dialog title="Conversation files" visible={dialog === 'files'} close={() => setDialog(null)}>
        {!files.data?.length && <Copy muted>No files attached yet.</Copy>}
        {files.data?.map((file) => (
          <Panel key={file.id}>
            <Copy translate={false}>{file.filename}</Copy>
            <Copy small muted>
              {file.status}
              {file.error_code ? ` · ${file.error_code.replaceAll('_', ' ')}` : ''}
            </Copy>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                secondary
                disabled={
                  file.status !== 'ready' ||
                  selectedFiles.length >= 5 ||
                  selectedFiles.includes(file.id)
                }
                onPress={() => {
                  setSelectedFiles((old) => [...old, file.id]);
                  setDialog(null);
                }}
              >
                Attach
              </Button>
              <Button
                secondary
                onPress={() =>
                  void api(`/v1/files/${file.id}`, json('DELETE', undefined, file.version))
                    .then(() => {
                      setSelectedFiles((old) => old.filter((id) => id !== file.id));
                      void cache.invalidateQueries({ queryKey: ['files', id] });
                    })
                    .catch(setError)
                }
              >
                Remove file
              </Button>
            </View>
          </Panel>
        ))}
      </Dialog>
    </View>
  );
}
function ModelList({
  models,
  selected,
  onSelect,
}: {
  models: Model[];
  selected: string | null;
  onSelect: (model: Model) => void;
}) {
  const { colors: c } = useTheme();
  return (
    <>
      {models.map((model) => (
        <Pressable
          key={model.id}
          accessibilityRole="button"
          onPress={() => onSelect(model)}
          style={{
            padding: 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: selected === model.id ? c.accent : c.border,
            backgroundColor: selected === model.id ? c.raised : c.surface,
            gap: 4,
          }}
        >
          <Text translate={false} style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
            {model.name}
          </Text>
          <Copy small muted>
            {model.supports_tools ? 'Tools supported' : 'Text chat'}
            {model.supports_images ? ' · Photos' : ''} ·{' '}
            {model.context_length?.toLocaleString() ?? 'Unknown'} {'context'}
          </Copy>
          <Copy small muted>
            Input ${model.input_price_per_million_usd ?? '?'} / Output $
            {model.output_price_per_million_usd ?? '?'} per 1M tokens
            {model.catalog_stale ? ' · Cached catalog' : ''}
          </Copy>
        </Pressable>
      ))}
    </>
  );
}
