import { ModelList } from './model-list';
import { ComposerInput, type ComposerHandle } from './composer-input';
import { EMPTY_SHAPE, sameShape, type ComposerShape } from './composer-shape';
import { consumeDraft } from './draft-transfer';
import { Pressable, Text } from './locale-ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, LayoutAnimationConfig } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatScrollView } from './chat-scroll-view';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { ChatExtras, RunUsage } from './chat-extras';
import { SourceCard } from './source-card';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { api, apiEnvelope, json } from './api';
import { useAuth } from './auth';
import { useTheme } from './theme';
import { useLocale } from './locale';
import { useCredential, useCapabilities, useModels, useProfile } from './queries';
import { useRun, activeStatus } from './use-run';
import { Button, Copy, ErrorNotice, Field, Panel } from './ui';
import { Dialog } from './dialog';
import {
  ConversationSidebar,
  useSidebarTransition,
} from './sidebar';
import { ConversationDrawer } from './conversation-drawer';
import { SearchModal } from './search-modal';
import { SettingsModal, type SettingsTab } from './settings-modal';
import { Markdown } from './markdown';
import { ApprovalCard } from './approval';
import { Attachment } from './attachment';
import { ComposerFrame } from './composer-frame';
import { GreetingName } from './greeting-name';
import { ChatThreadSkeleton, FoolSpinner, ThinkingSkeleton } from './fool-spinner';
import { ChatGptIcon, type ChatGptIconName } from './chatgpt-icons';
import { haptic } from './motion';
import { ReasoningEffortButton } from './reasoning-effort';
import { MessageRow } from './message-row';
import { collapseAttempts } from './visible-messages';
import { usePinnedChats } from './pinned-chats';
import { pickAndUpload } from './upload';
import type { Conversation, Message, Run, FileRecord, Snapshot } from './types';

const HEADER_HEIGHT = 52;
const OPTIMISTIC_ENTERING = FadeInDown.duration(220);

const styles = StyleSheet.create({
  column: { flex: 1, position: 'relative' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 60,
  },
  thread: { flexGrow: 1, gap: 16 },
  optimisticUser: { alignSelf: 'flex-end', maxWidth: '78%', gap: 6 },
  jump: { position: 'absolute', alignSelf: 'center', zIndex: 15 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, paddingTop: 20 },
  expandedComposer: { maxHeight: '88%' },
});

// On web, Keyboard.dismiss blurs the focused input, so taps and scrolls in the thread
// would take focus away from the composer while an answer streams.
const dismissKeyboardOnNative = () => {
  if (Platform.OS !== 'web') Keyboard.dismiss();
};

type Group = 'web' | 'files' | 'gmail' | 'calendar';
const groupLabels: Record<Group, string> = {
  web: 'Web research',
  files: 'Photos & files',
  gmail: 'Gmail',
  calendar: 'Google Calendar',
};

export function ChatWorkspace({ id: routeId }: { id?: string }) {
  const auth = useAuth();
  const params = useLocalSearchParams<{ draft?: string; project?: string; message?: string }>();
  const [documentSeed, setDocumentSeed] = useState<{ text: string; key: string }>();
  const [evidence, setEvidence] = useState<{ run: string; citation: string } | null>(null);
  const evidenceSnapshot = useQuery({
    queryKey: ['evidence', evidence?.run],
    queryFn: () => api<Snapshot>(`/v1/runs/${evidence!.run}`),
    enabled: !!evidence,
  });
  const [createdChat, setCreatedChat] = useState<Conversation | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>(routeId);
  const [homeModel, setHomeModel] = useState('anthropic/claude-haiku-5.5');
  useEffect(() => {
    setActiveId(routeId);
  }, [routeId]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onPop = () => {
      const match = window.location.pathname.match(/^\/chat\/([^/]+)$/);
      setActiveId(match ? decodeURIComponent(match[1]!) : undefined);
      setCreatedChat(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const id = activeId ?? createdChat?.id;
  const router = useRouter();
  const cache = useQueryClient();
  const { colors: c, isDark } = useTheme();
  const { language } = useLocale();
  const width = useWindowDimensions().width;
  const wide = width >= 1024;
  const inset = useSafeAreaInsets();
  const sidebarTransition = useSidebarTransition();
  const [drawer, setDrawer] = useState(false);
  const [dockHeight, setDockHeight] = useState(120);
  const onDockLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setDockHeight((prev) => (prev === next ? prev : next));
  }, []);
  const stickyOffset = useMemo(() => ({ closed: inset.bottom, opened: 0 }), [inset.bottom]);
  const headerOffset = HEADER_HEIGHT + inset.top;
  const fades = useMemo(
    () => ({
      header: { backgroundImage: `linear-gradient(to bottom, ${c.background} 70%, ${c.background}00 100%)` },
      dock: { backgroundImage: `linear-gradient(to bottom, ${c.background}00 0%, ${c.background} 28%)` },
    }),
    [c.background],
  );
  const [workToolsOpen, setWorkToolsOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [passageOpenId, setPassageOpenId] = useState<string | null>(null);
  const draftRef = useRef('');
  const composerInput = useRef<ComposerHandle>(null);
  const [shape, setShape] = useState<ComposerShape>(EMPTY_SHAPE);
  const onShapeChange = useCallback(
    (next: ComposerShape) => setShape((prev) => (sameShape(prev, next) ? prev : next)),
    [],
  );
  const setDraft = useCallback((text: string) => {
    draftRef.current = text;
    composerInput.current?.setText(text);
  }, []);
  const [optimisticUser, setOptimisticUser] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [inputEpoch, setInputEpoch] = useState(0);
  const [dialog, setDialog] = useState<
    'models' | 'tools' | 'rename' | 'delete' | 'retry' | 'files' | null
  >(null);
  const [targetChat, setTargetChat] = useState<Conversation | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [title, setTitle] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const pending = useRef<{ body: string; key: string; clientId: string } | null>(null);
  const sending = useRef(false);
  const creating = useRef<Promise<string> | null>(null);
  const profile = useProfile();
  const { pinnedIds, pinned, togglePin } = usePinnedChats();
  const credential = useCredential();
  const capabilities = useCapabilities();
  const models = useModels(!!credential.data?.configured);
  const notices = useQuery({
    queryKey: ['notices'],
    queryFn: () => api<{ id: string; read_at: string | null }[]>('/v1/notices'),
    refetchInterval: 30000,
    retry: false,
  });
  const unreadNotices = (notices.data ?? []).filter((n) => !n.read_at).length;

  useEffect(() => {
    setDraft(profile.data?.id ? (consumeDraft(profile.data.id, activeId ?? 'home') ?? '') : '');
    setSelectedFiles([]);
    setOptimisticUser(null);
    setError(null);
    pending.current = null;
    setEditingMessageId(null);
    setPassageOpenId(null);
    setAtBottom(true);
  }, [activeId, profile.data?.id, setDraft]);

  // Global Cmd/Ctrl+K search shortcut & Escape to dismiss model popover
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((v) => !v);
      } else if (e.key === 'Escape' && dialog === 'models') {
        e.preventDefault();
        setDialog(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const history = useInfiniteQuery({
    queryKey: ['conversations', ''],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiEnvelope<Conversation[]>(
        `/v1/conversations?limit=30${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: 30000,
  });
  const chat = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api<Conversation>(`/v1/conversations/${id}`),
    enabled: !!id,
    refetchInterval: 30000,
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
    refetchInterval: 10000,
  });
  const files = useQuery({
    queryKey: ['files', id],
    queryFn: () => api<FileRecord[]>(`/v1/conversations/${id}/files`),
    enabled: !!id,
    refetchInterval: 30000,
  });
  const targetMessage = useQuery({
    queryKey: ['message-context', params.message],
    queryFn: () => api<Message[]>(`/v1/messages/${params.message}/context`),
    enabled: !!params.message,
  });

  const latest = runs.data?.[0];
  const snapshot = useRun(latest?.id);
  const running = !!latest && activeStatus(snapshot.data?.run.status ?? latest.status);

  useEffect(() => {
    if (!id || running) return;
    void api(`/v1/conversations/${id}/seen`, { method: 'POST' })
      .then(() => cache.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => undefined);
  }, [id, running, cache]);
  const retryTargetId = snapshot.data?.run.assistant_message_id ?? latest?.assistant_message_id;
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

  const liveMessage = snapshot.data?.assistant_message;
  const visibleMessages = useMemo(() => {
    const list =
      messages.data?.pages
        .slice()
        .reverse()
        .flatMap((page) => page.data) ?? [];
    const merged = list.map((message) => (message.id === liveMessage?.id ? liveMessage : message));
    if (liveMessage && !merged.some((message) => message.id === liveMessage.id))
      merged.push(liveMessage);
    if (targetMessage.data) {
      for (const m of targetMessage.data) if (!merged.some((v) => v.id === m.id)) merged.push(m);
      merged.sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1));
    }
    return collapseAttempts(merged);
  }, [messages.data, liveMessage, targetMessage.data]);

  const lastMessage = visibleMessages.at(-1);
  const replySuggestions =
    lastMessage?.role === 'assistant' && lastMessage.status === 'complete'
      ? (lastMessage.suggestions ?? [])
      : [];
  const isHome = !id && !visibleMessages.length && optimisticUser === null;
  const firstName = (profile.data?.display_name ?? '').trim().split(/\s+/)[0] || '';
  const homeGreetingPrefix = language === 'ru' ? 'Что будем делать сегодня' : 'What are we doing today';
  const homeGreetingNode = firstName ? (
    <>
      {homeGreetingPrefix}, <GreetingName name={firstName} />?
    </>
  ) : (
    <>{homeGreetingPrefix}?</>
  );



  async function ensureChat() {
    if (id) return id;
    if (creating.current) return creating.current;
    creating.current = (async () => {
      const value = await api<Conversation>(
        '/v1/conversations',
        json('POST', { model_id: homeModel }),
      );
      if (params.project) {
        const attached = await api<Conversation>(
          `/v1/conversations/${value.id}`,
          json('PATCH', { project_id: params.project }, value.version),
        );
        Object.assign(value, attached);
      }
      cache.setQueryData(['conversation', value.id], value);
      setCreatedChat(value);
      void cache.invalidateQueries({ queryKey: ['conversations'] });
      return value.id;
    })();
    try {
      return await creating.current;
    } catch (e) {
      creating.current = null;
      throw e;
    }
  }

  async function createChat() {
    creating.current = null;
    setCreatedChat(null);
    setActiveId(undefined);
    setOptimisticUser(null);
    setDraft('');
    setSelectedFiles([]);
    setError(null);
    setDrawer(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
    } else if (routeId) {
      router.replace('/');
    }
  }

  function openChat(conversationId: string) {
    creating.current = null;
    setCreatedChat(null);
    setOptimisticUser(null);
    setError(null);
    setDrawer(false);
    setActiveId(conversationId);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', `/chat/${conversationId}`);
    } else if (routeId) {
      router.setParams({ id: conversationId });
    }
  }

  async function patch(body: Partial<Conversation>, explicitTarget?: Conversation | null) {
    const target = explicitTarget ?? chat.data;
    if (!target) {
      if (body.model_id) setHomeModel(body.model_id);
      setDialog(null);
      return;
    }
    try {
      const value = await api<Conversation>(
        `/v1/conversations/${target.id}`,
        json('PATCH', body, target.version),
      );
      if (target.id === id) cache.setQueryData(['conversation', id], value);
      void cache.invalidateQueries({ queryKey: ['conversations'] });
      setTargetChat(null);
      setDialog(null);
    } catch (e) {
      setError(e);
      if (target.id === id) void chat.refetch();
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
      (!draftRef.current.trim() && !selectedFiles.length)
    )
      return;
    sending.current = true;
    setBusy(true);
    setError(null);
    Keyboard.dismiss();
    const outgoingText = draftRef.current;
    const outgoingFiles = selectedFiles;
    const startingFromHome = isHome;
    const resetComposer = () => {
      setDraft('');
      setSelectedFiles([]);
      setComposerExpanded(false);
      setInputEpoch((n) => n + 1);
      setComposerFocused(false);
    };
    haptic();
    if (startingFromHome) {
      setOptimisticUser(outgoingText);
      resetComposer();
    }
    try {
      const targetId = await ensureChat();
      const body = JSON.stringify({ text: outgoingText, file_ids: outgoingFiles });
      if (pending.current?.body !== body)
        pending.current = { body, key: Crypto.randomUUID(), clientId: Crypto.randomUUID() };
      const saved = pending.current;
      const value = await api<{ run: Run }>(
        `/v1/conversations/${targetId}/messages`,
        json(
          'POST',
          { client_message_id: saved.clientId, text: outgoingText, file_ids: outgoingFiles },
          undefined,
          saved.key,
        ),
      );
      pending.current = null;
      if (!startingFromHome) resetComposer();
      Keyboard.dismiss();
      setAtBottom(true);
      cache.setQueryData(['runs', targetId], (old: Run[] | undefined) => [
        value.run,
        ...(old ?? []),
      ]);
      await cache.invalidateQueries({ queryKey: ['messages', targetId] });
      setOptimisticUser(null);
      if (!activeId) {
        setActiveId(targetId);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/chat/${targetId}`);
        }
      }
      void cache.invalidateQueries({ queryKey: ['conversations'] });
    } catch (e) {
      if (startingFromHome) {
        setOptimisticUser(null);
        setDraft(outgoingText);
        setSelectedFiles(outgoingFiles);
      }
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

  const startEdit = useCallback((messageId: string) => setEditingMessageId(messageId), []);
  const selectVariant = useCallback(
    async (messageId: string, variantId: string) => {
      if (!id) return;
      setError(null);
      try {
        await api(`/v1/messages/${messageId}/select-variant`, {
          ...json('POST', { message_id: variantId }),
        });
        haptic();
        await cache.invalidateQueries({ queryKey: ['messages', id] });
      } catch (e) {
        setError(e);
      }
    },
    [cache, id],
  );
  const cancelEdit = useCallback(() => setEditingMessageId(null), []);
  const submitEdit = useCallback(
    async (messageId: string, text: string) => {
      if (!id) return false;
      setError(null);
      try {
        const value = await api<{ run: Run }>(
          `/v1/messages/${messageId}/edit`,
          json('POST', { text }, undefined, Crypto.randomUUID()),
        );
        haptic();
        cache.setQueryData(['runs', id], (old: Run[] | undefined) => [value.run, ...(old ?? [])]);
        setEditingMessageId(null);
        setAtBottom(true);
        void cache.invalidateQueries({ queryKey: ['messages', id] });
        return true;
      } catch (e) {
        setError(e);
        return false;
      }
    },
    [cache, id],
  );
  const openRetry = useCallback(() => setDialog('retry'), []);
  const openCitation = useCallback(
    (run: string, citation: string) => setEvidence({ run, citation }),
    [],
  );
  const togglePassage = useCallback(
    (messageId: string) => setPassageOpenId((cur) => (cur === messageId ? null : messageId)),
    [],
  );
  const closePassage = useCallback(() => setPassageOpenId(null), []);
  const saveDocument = useCallback(
    (text: string) => setDocumentSeed({ text, key: Crypto.randomUUID() }),
    [],
  );
  const openFile = useCallback((fileId: string) => {
    void api<{ url: string }>(`/v1/files/${fileId}/download`)
      .then((value) => Linking.openURL(value.url))
      .catch(setError);
  }, []);
  const scrollToHighlight = useCallback((y: number) => {
    scroll.current?.scrollTo({ y: Math.max(0, y - 30), animated: false });
  }, []);

  async function upload() {
    setUploading(true);
    setError(null);
    try {
      const file = await pickAndUpload(ensureChat);
      if (file) {
        const targetId = file.conversation_id;
        setSelectedFiles((old) => [...old, file.id]);
        cache.setQueryData(['files', targetId], (old: FileRecord[] | undefined) => [
          file,
          ...(old ?? []).filter((item) => item.id !== file.id),
        ]);
        await cache.invalidateQueries({ queryKey: ['files', targetId] });
      }
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  }

  async function removeChat() {
    const target = targetChat ?? chat.data;
    if (!target) return;
    try {
      await api(`/v1/conversations/${target.id}`, json('DELETE', undefined, target.version));
      setDialog(null);
      setTargetChat(null);
      await cache.invalidateQueries({ queryKey: ['conversations'] });
      if (target.id === id) void createChat();
    } catch (e) {
      setError(e);
    }
  }

  const handlers = useRef({
    send,
    createChat,
    openChat,
    togglePin,
    signOut: auth.signOut,
    fetchMore: history.fetchNextPage,
    router,
  });
  useLayoutEffect(() => {
    handlers.current = {
      send,
      createChat,
      openChat,
      togglePin,
      signOut: auth.signOut,
      fetchMore: history.fetchNextPage,
      router,
    };
  });
  const submitComposer = useCallback(() => void handlers.current.send(), []);
  const getDraft = useCallback(() => draftRef.current, []);
  const sidebarActions = useMemo(
    () => ({
      closeDrawer: () => setDrawer(false),
      toggleExpanded: () => setSidebarExpanded((value) => !value),
      onNew: () => void handlers.current.createChat(),
      onOpenSearch: () => {
        setDrawer(false);
        setSearchModalOpen(true);
      },
      onSelect: (conversationId: string) => handlers.current.openChat(conversationId),
      onTogglePin: (item: Conversation) => handlers.current.togglePin(item.id),
      onRename: (item: Conversation) => {
        setTargetChat(item);
        setTitle(item.title);
        setDialog('rename');
      },
      onDelete: (item: Conversation) => {
        setTargetChat(item);
        setDialog('delete');
      },
      onWorkspace: (tab: 'projects' | 'documents' | 'schedules' | 'notices') => {
        setDrawer(false);
        handlers.current.router.push({ pathname: '/workspace', params: { tab } } as Href);
      },
      onConnections: () => {
        setDrawer(false);
        setSettingsTab('connections');
      },
      onSettings: () => {
        setDrawer(false);
        setSettingsTab('general');
      },
      onSignOut: () => {
        setDrawer(false);
        void handlers.current.signOut();
      },
      onMore: () => void handlers.current.fetchMore(),
    }),
    [],
  );

  const fileReady = selectedFiles.every((fileId) =>
    files.data?.some((file) => file.id === fileId && file.status === 'ready'),
  );
  const canSend =
    !busy &&
    !uploading &&
    !!credential.data?.configured &&
    !!(chat.data?.model_id ?? homeModel) &&
    !incompatible &&
    !imageIncompatible &&
    fileReady &&
    (shape.hasText || !!selectedFiles.length);

  const webEnabled = chat.data?.enabled_tools.includes('web') ?? true;
  const webAvailable = capabilities.data?.tools.web === 'available';
  const multilineComposer = shape.multiline || selectedFiles.length > 0;
  const stackedComposer = !wide || multilineComposer;

  const attachBtn = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Attach photos or files"
      disabled={
        uploading ||
        running ||
        selectedFiles.length >= 5 ||
        capabilities.data?.tools.files !== 'available'
      }
      onPress={() => void upload()}
      style={({ hovered, pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hovered || pressed ? c.hover : 'transparent',
        opacity:
          uploading ||
          running ||
          selectedFiles.length >= 5 ||
          capabilities.data?.tools.files !== 'available'
            ? 0.4
            : 1,
      })}
    >
      {uploading ? (
        <FoolSpinner size={20} label="Uploading attachment" />
      ) : (
        <ChatGptIcon name="plus" size={20} color={c.text} />
      )}
    </Pressable>
  );

  const toolsBtn = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Choose tools"
      onPress={() =>
        void ensureChat()
          .then(() => setDialog('tools'))
          .catch(setError)
      }
      style={({ hovered, pressed }) => ({
        height: 34,
        width: wide ? undefined : 34,
        paddingHorizontal: wide ? 10 : 0,
        borderRadius: 17,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: wide ? 6 : 0,
        backgroundColor:
          webEnabled && webAvailable
            ? c.infoSoft
            : hovered || pressed
              ? c.hover
              : 'transparent',
      })}
    >
      <ChatGptIcon
        name="globe"
        size={15}
        color={webEnabled && webAvailable ? c.info : c.muted}
      />
      {wide && (
        <Text
          style={{
            fontSize: 13,
            fontWeight: '500',
            color: webEnabled && webAvailable ? c.info : c.muted,
          }}
        >
          Tools
        </Text>
      )}
    </Pressable>
  );

  const actionBtn = running ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Stop"
      onPress={() => void stop()}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.accent,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <ChatGptIcon name="stop" size={14} color={c.accentText} />
    </Pressable>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send ↑"
      disabled={!canSend}
      onPress={() => void send()}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: canSend ? c.accent : isDark ? '#424242' : '#d7d7d7',
        opacity: pressed && canSend ? 0.8 : 1,
      })}
    >
      <ChatGptIcon
        name="arrowUp"
        size={17}
        color={canSend ? c.accentText : isDark ? '#212121' : '#ffffff'}
      />
    </Pressable>
  );

  const inputField = (
    <ComposerInput
      key={inputEpoch}
      ref={composerInput}
      textRef={draftRef}
      expanded={composerExpanded}
      layoutKey={`${wide}:${selectedFiles.length}`}
      onShapeChange={onShapeChange}
      onSubmit={submitComposer}
      onFocusChange={setComposerFocused}
    />
  );

  const composer = (
    <View
      style={{
        width: '100%',
        maxWidth: isHome ? 680 : 792,
        alignSelf: 'center',
        paddingHorizontal: 12,
        paddingBottom: wide ? 14 : 10,
        paddingTop: 4,
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
      {!!selectedFiles.length && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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

      {!running && !shape.hasText && replySuggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="reply-suggestions"
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {replySuggestions.map((text) => (
            <Pressable
              key={text}
              accessibilityRole="button"
              accessibilityLabel={`Send reply: ${text}`}
              onPress={() => {
                setDraft(text);
                void handlers.current.send();
              }}
              style={({ hovered, pressed }) => ({
                minHeight: wide ? 36 : 44,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: pressed || hovered ? c.hover : c.raised,
              })}
            >
              <Text translate={false} numberOfLines={1} style={{ fontSize: 14, color: c.text }}>
                {text}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <ComposerFrame focused={composerFocused} compact={!stackedComposer}>
        <View style={{ gap: stackedComposer ? 8 : 0, position: 'relative' }}>
          <View
            style={{
              paddingLeft: stackedComposer ? 0 : 40,
              paddingRight: stackedComposer ? 0 : wide ? 122 : 84,
              minHeight: stackedComposer ? undefined : 36,
              justifyContent: 'center',
            }}
          >
            {inputField}
          </View>
          <View
            pointerEvents="box-none"
            style={
              stackedComposer
                ? { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'space-between' }
                : {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }
            }
          >
            {attachBtn}
            <View
              style={{
                flexDirection: 'row',
                gap: 6,
                alignItems: 'center',
                marginLeft: 'auto',
              }}
            >
              {!!id && !!currentModel?.reasoning_efforts?.length && (
                <ReasoningEffortButton
                  efforts={currentModel.reasoning_efforts}
                  value={chat.data?.reasoning_effort ?? null}
                  wide={wide}
                  onSelect={(next) => void patch({ reasoning_effort: next })}
                />
              )}
              {toolsBtn}
              {(shape.tall || composerExpanded) && (
                <Pressable
                  testID="composer-expand"
                  accessibilityRole="button"
                  accessibilityLabel={composerExpanded ? 'Collapse composer' : 'Expand composer'}
                  onPress={() => setComposerExpanded((v) => !v)}
                  style={({ pressed }) => ({
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? c.hover : 'transparent',
                  })}
                >
                  <ChatGptIcon
                    name={composerExpanded ? 'arrowDown' : 'arrowUp'}
                    size={16}
                    color={c.muted}
                  />
                </Pressable>
              )}
              {actionBtn}
            </View>
          </View>
        </View>
      </ComposerFrame>

      {imageIncompatible && (
        <ErrorNotice error="This model cannot see photos. Choose a model with photo support." />
      )}
      <ErrorNotice error={error} />
    </View>
  );

  const conversations = useMemo(
    () => history.data?.pages.flatMap((page) => page.data) ?? [],
    [history.data],
  );

  const sidebar = (mobile = false) => (
    <ConversationSidebar
      mobile={mobile}
      expanded={mobile || sidebarExpanded}
      selectedId={id}
      conversations={conversations}
      pinned={pinned}
      pinnedIds={pinnedIds}
      onToggle={mobile ? sidebarActions.closeDrawer : sidebarActions.toggleExpanded}
      onNew={sidebarActions.onNew}
      onOpenSearch={sidebarActions.onOpenSearch}
      onSelect={sidebarActions.onSelect}
      onTogglePin={sidebarActions.onTogglePin}
      onRename={sidebarActions.onRename}
      onDelete={sidebarActions.onDelete}
      onWorkspace={sidebarActions.onWorkspace}
      onConnections={sidebarActions.onConnections}
      onSettings={sidebarActions.onSettings}
      onSignOut={sidebarActions.onSignOut}
      displayName={profile.data?.display_name}
      unreadNotices={unreadNotices}
      busy={busy || uploading}
      loading={history.isPending}
      loadingMore={history.isFetchingNextPage}
      error={history.error}
      hasMore={!!history.hasNextPage}
      onMore={sidebarActions.onMore}
    />
  );

  const loadingThread =
    !!id &&
    createdChat?.id !== id &&
    (chat.isPending || (messages.isPending && !visibleMessages.length)) &&
    optimisticUser === null;

  const modelLabel = (currentModel?.name ?? 'Claude Haiku 5.5').replace(
    /^(Google|OpenAI|Anthropic): /,
    '',
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.background }}>
      {wide && (
        <View
          style={[
            { width: sidebarExpanded ? 260 : 52, flexShrink: 0, zIndex: 20 },
            sidebarTransition,
          ]}
        >
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
            {sidebar()}
          </View>
        </View>
      )}

      {evidence && (
        <Dialog
          visible
          title="Source evidence"
          close={() => setEvidence(null)}
          loading={evidenceSnapshot.isPending}
        >
          {evidenceSnapshot.data?.sources
            .filter((s) => s.citation_id === evidence.citation)
            .map((s) => (
              <SourceCard key={s.citation_id} source={s} onError={setError} initiallyOpen />
            ))}
          {evidenceSnapshot.data &&
            !evidenceSnapshot.data.sources.some((s) => s.citation_id === evidence.citation) && (
              <Copy>No stored source matches this citation.</Copy>
            )}
          <ErrorNotice error={evidenceSnapshot.error} />
        </Dialog>
      )}

      <View
        style={{
          flex: 1,
          minWidth: 0,
          paddingRight: wide && workToolsOpen ? 420 : 0,
          position: 'relative',
        }}
      >
        {/* ChatGPT 52px top header */}
        <View
          testID="chat-header"
          style={[styles.header, fades.header, { height: headerOffset, paddingTop: inset.top, paddingHorizontal: wide ? 16 : 10 }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            {!wide && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open conversation history"
                onPress={() => setDrawer(true)}
                style={({ hovered, pressed }) => ({
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hovered || pressed ? c.hover : 'transparent',
                })}
              >
                <ChatGptIcon name="sidebarHidden" size={18} color={c.muted} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose model"
              onPress={() => setDialog(dialog === 'models' ? null : 'models')}
              style={({ hovered, pressed }) => ({
                height: 38,
                maxWidth: wide ? 360 : 210,
                paddingHorizontal: 10,
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor:
                  dialog === 'models' ? c.hover : hovered || pressed ? c.hover : 'transparent',
              })}
            >
              <Text
                translate={false}
                numberOfLines={1}
                style={{ color: c.text, fontSize: 16, fontWeight: '600' }}
              >
                {modelLabel}
              </Text>
              <ChatGptIcon name="chevronDown" size={15} color={c.muted} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {!!id && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Conversation menu"
                onPress={() => {
                  setTargetChat(chat.data ?? null);
                  setDialog('tools');
                }}
                style={({ hovered, pressed }) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hovered || pressed ? c.hover : 'transparent',
                })}
              >
                <ChatGptIcon name="dots" size={17} color={c.muted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Top-left floating Model Dropdown Popover (on desktop/wide) */}
        {dialog === 'models' && wide && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              onPress={() => setDialog(null)}
              style={[StyleSheet.absoluteFill, { zIndex: 35 }]}
            />
            <View
              testID="model-popover"
              style={{
                position: 'absolute',
                top: 50,
                left: 16,
                width: 340,
                maxHeight: 430,
                backgroundColor: isDark ? '#2f2f2f' : '#ffffff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: c.border,
                padding: 10,
                gap: 8,
                zIndex: 40,
                ...(Platform.OS === 'web'
                  ? {
                      boxShadow: isDark
                        ? '0 14px 40px rgba(0, 0, 0, 0.55)'
                        : '0 10px 32px rgba(0, 0, 0, 0.14)',
                    }
                  : {}),
              }}
            >
              <Field
                accessibilityLabel="Search models"
                placeholder="Search models"
                value={modelSearch}
                onChangeText={setModelSearch}
                style={{ minHeight: 38, borderRadius: 10, fontSize: 14, paddingVertical: 6 }}
              />
              <ErrorNotice error={models.error} />
              {models.isPending && credential.data?.configured && (
                <FoolSpinner
                  size={24}
                  label="Loading models"
                  style={{ alignSelf: 'center', marginVertical: 12 }}
                />
              )}
              <ScrollView keyboardShouldPersistTaps="handled">
                <ModelList
                  showPopular={!modelSearch.trim()}
                  models={(models.data ?? []).filter((m) =>
                    `${m.name} ${m.id}`.toLowerCase().includes(modelSearch.toLowerCase()),
                  )}
                  selected={chat.data?.model_id ?? homeModel}
                  onSelect={(model) => void patch({ model_id: model.id })}
                />
              </ScrollView>
            </View>
          </>
        )}

        <ChatExtras
          chat={chat.data}
          messages={visibleMessages}
          getDraft={getDraft}
          fileIds={selectedFiles}
          onDraft={setDraft}
          running={running}
          documentSeed={documentSeed}
          open={workToolsOpen}
          onOpenChange={setWorkToolsOpen}
        />

        <View style={styles.column}>
          {isHome ? (
            <KeyboardAvoidingView behavior="padding" style={styles.column}>
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: wide ? 24 : 12,
                paddingTop: headerOffset,
                paddingBottom: (wide ? 88 : 24) + inset.bottom,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              onScrollBeginDrag={dismissKeyboardOnNative}
            >
              <Pressable
                accessible={false}
                onPress={dismissKeyboardOnNative}
                style={{
                  width: '100%',
                  maxWidth: 680,
                  marginBottom: 24,
                  alignItems: 'center',
                  flexGrow: 1,
                  justifyContent: 'center',
                }}
              >
                <Text
                  translate={false}
                  style={{
                    fontSize: wide ? 28 : 24,
                    lineHeight: wide ? 36 : 32,
                    fontWeight: '500',
                    letterSpacing: -0.4,
                    color: c.greeting,
                    textAlign: 'center',
                  }}
                >
                  {homeGreetingNode}
                </Text>
              </Pressable>
              {composer}
            </ScrollView>
            </KeyboardAvoidingView>
          ) : (
            <>
              <ChatScrollView
                ref={scroll}
                style={styles.column}
                keyboardLiftBehavior="whenAtEnd"
                offset={0}
                contentContainerStyle={{
                  paddingHorizontal: wide ? 24 : 14,
                  paddingTop: headerOffset + 16,
                  paddingBottom: dockHeight + inset.bottom + 16,
                  maxWidth: 792,
                  width: '100%',
                  alignSelf: 'center',
                  flexGrow: 1,
                }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                onScrollBeginDrag={dismissKeyboardOnNative}
                onScroll={(event) => {
                  const n = event.nativeEvent;
                  setAtBottom(
                    n.contentOffset.y + n.layoutMeasurement.height >= n.contentSize.height - 100,
                  );
                }}
                scrollEventThrottle={150}
                onContentSizeChange={() => {
                  if (atBottom && !params.message) scroll.current?.scrollToEnd({ animated: false });
                }}
              >
              <Pressable
                accessible={false}
                onPress={dismissKeyboardOnNative}
                style={styles.thread}
              >
                {messages.hasNextPage && (
                  <Button secondary onPress={() => void messages.fetchNextPage()}>
                    Load earlier messages
                  </Button>
                )}
                {id && chat.isError && (
                  <View style={{ padding: 16, gap: 14 }}>
                    <Copy>Conversation not found or temporarily unavailable.</Copy>
                    <ErrorNotice error={chat.error} />
                    <Button onPress={() => void createChat()}>Back to conversations</Button>
                  </View>
                )}
                {loadingThread && <ChatThreadSkeleton />}
                {!loadingThread && !chat.isError && !visibleMessages.length && optimisticUser === null && (
                  <View style={{ paddingVertical: wide ? 80 : 40, alignItems: 'center', gap: 14 }}>
                    <Text
                      translate={false}
                      style={{
                        fontSize: wide ? 28 : 24,
                        fontWeight: '500',
                        letterSpacing: -0.4,
                        color: c.greeting,
                      }}
                    >
                      {homeGreetingNode}
                    </Text>
                  </View>
                )}
                {optimisticUser !== null && !visibleMessages.some((m) => m.role === 'user') && (
                  <>
                    <Animated.View
                      testID="chat-message"
                      entering={OPTIMISTIC_ENTERING}
                      style={styles.optimisticUser}
                    >
                      <View
                        testID="user-message-bubble"
                        style={{
                          paddingHorizontal: 18,
                          paddingVertical: 11,
                          borderRadius: 22,
                          backgroundColor: c.userBubble,
                        }}
                      >
                        <Markdown text={optimisticUser} />
                      </View>
                    </Animated.View>
                    <View testID="chat-message" style={{ alignSelf: 'stretch' }}>
                      <ThinkingSkeleton />
                    </View>
                  </>
                )}
              <LayoutAnimationConfig
                key={`${id ?? 'new'}:${loadingThread}:${optimisticUser === null}`}
                skipEntering
              >
              {visibleMessages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  files={files.data}
                  highlighted={params.message === message.id}
                  editing={editingMessageId === message.id}
                  canRetry={!running && message.id === retryTargetId}
                  busy={busy || running}
                  passageOpen={passageOpenId === message.id}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSubmitEdit={submitEdit}
                  onRetry={openRetry}
                  onCitation={openCitation}
                  onTogglePassage={togglePassage}
                  onClosePassage={closePassage}
                  onSaveDocument={saveDocument}
                  onSelectVariant={selectVariant}
                  onDraft={setDraft}
                  onOpenFile={openFile}
                  onHighlightLayout={scrollToHighlight}
                  onError={setError}
                />
              ))}
              </LayoutAnimationConfig>

              {(snapshot.data?.tool_calls ?? [])
                .filter((tool) => running || tool.status === 'unknown' || tool.status === 'failed')
                .map((tool) => {
                  const active = tool.status === 'executing' || tool.status === 'pending';
                  const failed = tool.status === 'failed' || tool.status === 'unknown';
                  return (
                    <View
                      key={tool.id}
                      testID="tool-activity-pill"
                      style={{
                        alignSelf: 'flex-start',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 9999,
                        backgroundColor: c.raised,
                        borderWidth: 1,
                        borderColor: failed ? c.danger : c.borderSubtle,
                      }}
                    >
                      {active ? (
                        <View
                          testID="chatgpt-thinking-dot"
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: c.info,
                          }}
                        />
                      ) : (
                        <ChatGptIcon
                          name={failed ? 'close' : 'check'}
                          size={12}
                          color={failed ? c.danger : c.muted}
                        />
                      )}
                      <Text
                        style={{
                          fontSize: 12.5,
                          color: failed ? c.danger : c.muted,
                          fontWeight: '500',
                        }}
                      >
                        {tool.name.replaceAll('_', ' ')} · {tool.status}
                      </Text>
                      {tool.status === 'unknown' && (
                        <Text style={{ fontSize: 12, color: c.danger }}>
                          Outcome unconfirmed. Check the provider before trying again.
                        </Text>
                      )}
                    </View>
                  );
                })}
              {snapshot.data?.approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
              <RunUsage run={snapshot.data?.run} />
              {snapshot.data?.run.error_code && (
                <ErrorNotice
                  error={new Error(snapshot.data.run.error_code.replaceAll('_', ' ').toLowerCase())}
                />
              )}
              <ErrorNotice error={messages.error ?? runs.error} />
              </Pressable>
            </ChatScrollView>

            {!atBottom && (
              <View style={[styles.jump, { bottom: dockHeight + 12 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jump to latest ↓"
                  onPress={() => {
                    setAtBottom(true);
                    scroll.current?.scrollToEnd({ animated: true });
                  }}
                  style={({ hovered }) => ({
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: hovered ? c.hover : c.raised,
                    borderWidth: 1,
                    borderColor: c.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(Platform.OS === 'web'
                      ? { boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)' }
                      : {}),
                  })}
                >
                  <ChatGptIcon name="arrowDown" size={16} color={c.text} />
                </Pressable>
              </View>
            )}
            <KeyboardStickyView
              offset={stickyOffset}
              onLayout={onDockLayout}
              style={[styles.dock, fades.dock]}
            >
              {!composerExpanded && composer}
            </KeyboardStickyView>
            {composerExpanded && (
              <View
                testID="composer-expanded-sheet"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  zIndex: 55,
                  backgroundColor: c.background,
                  paddingTop: inset.top + 8,
                  paddingBottom: inset.bottom + 8,
                  justifyContent: 'flex-end',
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Collapse composer"
                  onPress={() => {
                    setComposerExpanded(false);
                    Keyboard.dismiss();
                  }}
                  style={{ flex: 1 }}
                />
                <KeyboardStickyView offset={stickyOffset} style={styles.expandedComposer}>
                  {composer}
                </KeyboardStickyView>
              </View>
            )}
            </>
          )}
        </View>
      </View>

      {!wide && (
        <ConversationDrawer open={drawer} onOpenChange={setDrawer}>
          {sidebar(true)}
        </ConversationDrawer>
      )}

      <SearchModal
        visible={searchModalOpen}
        close={() => setSearchModalOpen(false)}
        conversations={conversations}
        onSelectChat={(cid) => openChat(cid)}
        onSelectMessage={(cid, mid) =>
          router.push({ pathname: '/chat/[id]', params: { id: cid, message: mid } } as Href)
        }
        onNewChat={() => void createChat()}
      />

      <SettingsModal
        visible={!!settingsTab}
        close={() => setSettingsTab(null)}
        initialTab={settingsTab ?? 'general'}
      />

      {!wide && (
        <Dialog title="Choose a model" visible={dialog === 'models'} close={() => setDialog(null)}>
          <Field
            accessibilityLabel="Search models"
            placeholder="Search models"
            value={modelSearch}
            onChangeText={setModelSearch}
          />
          <ErrorNotice error={models.error} />
          {models.isPending && credential.data?.configured && (
            <FoolSpinner size={24} label="Loading models" />
          )}
          <ModelList
            showPopular={!modelSearch.trim()}
            models={(models.data ?? []).filter((m) =>
              `${m.name} ${m.id}`.toLowerCase().includes(modelSearch.toLowerCase()),
            )}
            selected={chat.data?.model_id ?? homeModel}
            onSelect={(model) => void patch({ model_id: model.id })}
          />
        </Dialog>
      )}

      <Dialog
        title="Tools & conversation"
        visible={dialog === 'tools'}
        close={() => setDialog(null)}
      >
        <Text style={{ fontSize: 13, color: c.muted, lineHeight: 19, marginBottom: 4 }}>
          Changes apply to the next run. Connect Google services in Settings.
        </Text>

        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.borderSubtle,
            overflow: 'hidden',
          }}
        >
          {(Object.keys(groupLabels) as Group[]).map((group, idx) => {
            const enabled = !!chat.data?.enabled_tools.includes(group);
            const available = capabilities.data?.tools[group] === 'available';
            const disabled = !available && !enabled;
            const iconName: ChatGptIconName =
              group === 'web'
                ? 'globe'
                : group === 'files'
                  ? 'paperclip'
                  : group === 'gmail'
                    ? 'edit'
                    : 'scheduled';
            return (
              <Pressable
                key={group}
                accessibilityRole="button"
                accessibilityState={{ checked: enabled, disabled }}
                disabled={disabled}
                onPress={() =>
                  void patch({
                    enabled_tools: enabled
                      ? chat.data!.enabled_tools.filter((g) => g !== group)
                      : [...chat.data!.enabled_tools, group],
                  })
                }
                style={({ hovered, pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  borderTopWidth: idx > 0 ? StyleSheet.hairlineWidth : 0,
                  borderTopColor: c.borderSubtle,
                  backgroundColor: !disabled && (hovered || pressed) ? c.hover : 'transparent',
                  opacity: disabled ? 0.5 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <ChatGptIcon name={iconName} size={16} color={c.text} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: c.text }}>
                      {groupLabels[group]}
                    </Text>
                    {!available && (
                      <Text style={{ fontSize: 12, color: c.subtle }}>Not connected</Text>
                    )}
                  </View>
                </View>
                <View
                  style={{
                    width: 38,
                    height: 22,
                    borderRadius: 11,
                    padding: 2,
                    justifyContent: 'center',
                    alignItems: enabled ? 'flex-end' : 'flex-start',
                    backgroundColor: enabled
                      ? c.success
                      : isDark
                        ? 'rgba(255,255,255,0.18)'
                        : '#d4d4d4',
                  }}
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: '#ffffff',
                    }}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.borderSubtle,
            overflow: 'hidden',
            marginTop: 4,
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => setDialog('files')}
            style={({ hovered, pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              paddingVertical: 12,
              backgroundColor: hovered || pressed ? c.hover : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ChatGptIcon name="library" size={16} color={c.text} />
              <Text style={{ fontSize: 14, color: c.text }}>Conversation files</Text>
            </View>
            <ChatGptIcon name="chevronRight" size={15} color={c.muted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDialog(null);
              setWorkToolsOpen((v) => !v);
            }}
            style={({ hovered, pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.borderSubtle,
              backgroundColor: hovered || pressed ? c.hover : 'transparent',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ChatGptIcon name="sliders" size={16} color={c.text} />
              <Text style={{ fontSize: 14, color: c.text }}>Work tools</Text>
            </View>
            <ChatGptIcon name="chevronRight" size={15} color={c.muted} />
          </Pressable>

          {!!(targetChat ?? chat.data) && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const current = targetChat ?? chat.data;
                if (current) togglePin(current.id);
                setDialog(null);
              }}
              style={({ hovered, pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: c.borderSubtle,
                backgroundColor: hovered || pressed ? c.hover : 'transparent',
              })}
            >
              <ChatGptIcon name="pin" size={16} color={c.text} />
              <Text style={{ fontSize: 14, color: c.text }}>
                {pinnedIds.includes((targetChat ?? chat.data)!.id)
                  ? 'Unpin conversation'
                  : 'Pin conversation'}
              </Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const current = targetChat ?? chat.data;
              setTitle(current?.title ?? '');
              setDialog('rename');
            }}
            style={({ hovered, pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.borderSubtle,
              backgroundColor: hovered || pressed ? c.hover : 'transparent',
            })}
          >
            <ChatGptIcon name="edit" size={16} color={c.text} />
            <Text style={{ fontSize: 14, color: c.text }}>Rename conversation</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => setDialog('delete')}
            style={({ hovered, pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: c.borderSubtle,
              backgroundColor: hovered || pressed ? c.hover : 'transparent',
            })}
          >
            <ChatGptIcon name="trash" size={16} color={c.danger} />
            <Text style={{ fontSize: 14, color: c.danger, fontWeight: '500' }}>
              Delete conversation
            </Text>
          </Pressable>
        </View>
      </Dialog>

      <Dialog
        title="Rename conversation"
        visible={dialog === 'rename'}
        close={() => {
          setTargetChat(null);
          setDialog(null);
        }}
      >
        <Field accessibilityLabel="Conversation title" value={title} onChangeText={setTitle} />
        <Button
          disabled={!title.trim()}
          onPress={() => void patch({ title: title.trim() }, targetChat)}
        >
          Save title
        </Button>
      </Dialog>

      <Dialog
        title="Delete conversation?"
        visible={dialog === 'delete'}
        close={() => {
          setTargetChat(null);
          setDialog(null);
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
                      setSelectedFiles((old) => old.filter((fid) => fid !== file.id));
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
