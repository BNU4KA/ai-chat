import { ModelList } from './model-list';
import { transferDraft, consumeDraft } from './draft-transfer';
import { Pressable, Text } from './locale-ui';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { ChatExtras, PassageActions, RunUsage } from './chat-extras';
import { SourceCard } from './source-card';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { api, apiEnvelope, json } from './api';
import { useAuth } from './auth';
import { useTheme } from './theme';
import { useCredential, useCapabilities, useModels, useProfile } from './queries';
import { useRun, activeStatus } from './use-run';
import { Button, Copy, ErrorNotice, Field, Loading, Panel } from './ui';
import { Dialog } from './dialog';
import {
  BRAND_NAME,
  ConversationSidebar,
  ConversationDrawer,
  useSidebarTransition,
} from './sidebar';
import { SearchModal } from './search-modal';
import { SettingsModal, type SettingsTab } from './settings-modal';
import { Markdown } from './markdown';
import { ApprovalCard } from './approval';
import { Attachment } from './attachment';
import { MessageActions } from './message-actions';
import { ComposerFrame } from './composer-frame';
import { FoolSpinner, ThinkingSkeleton } from './fool-spinner';
import { ChatGptIcon, type ChatGptIconName } from './chatgpt-icons';
import { useMotionPaused } from './motion';
import { usePinnedChats } from './pinned-chats';
import { pickAndUpload } from './upload';
import type { Conversation, Message, Run, FileRecord, Snapshot } from './types';

function StreamingMarkdown({
  text,
  streaming,
  onCitation,
}: {
  text: string;
  streaming: boolean;
  onCitation?: (id: string) => void;
}) {
  const reduced = useMotionPaused();
  const [shown, setShown] = useState(streaming && !reduced ? 0 : text.length);

  useEffect(() => {
    if (reduced) {
      setShown(text.length);
      return;
    }
    if (shown >= text.length) return;
    const step = () => {
      setShown((cur) => {
        if (cur >= text.length) return text.length;
        const gap = text.length - cur;
        const delta = streaming
          ? gap > 90
            ? Math.min(8, Math.ceil(gap / 18))
            : 1
          : gap > 40
            ? Math.min(12, Math.ceil(gap / 10))
            : Math.min(3, gap);
        return Math.min(text.length, cur + delta);
      });
    };
    if (Platform.OS === 'web') {
      const frame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(step, 18);
    return () => clearTimeout(timer);
  }, [text, streaming, reduced, shown]);

  const active = !reduced && (streaming || shown < text.length);
  const visible = active ? text.slice(0, shown) : text;
  return <Markdown text={visible} streaming={active} onCitation={onCitation} />;
}

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
  const [homeModel, setHomeModel] = useState('anthropic/claude-haiku-5.5');
  const id = routeId ?? createdChat?.id;
  const router = useRouter();
  const cache = useQueryClient();
  const { colors: c, isDark, setChoice } = useTheme();
  const width = useWindowDimensions().width;
  const wide = width >= 1024;
  const sidebarTransition = useSidebarTransition();
  const [drawer, setDrawer] = useState(false);
  const [workToolsOpen, setWorkToolsOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [passageOpenId, setPassageOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(24);
  const [optimisticUser, setOptimisticUser] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [dialog, setDialog] = useState<
    'models' | 'tools' | 'rename' | 'delete' | 'retry' | 'files' | null
  >(null);
  const [targetChat, setTargetChat] = useState<Conversation | null>(null);
  const [modelSearch, setModelSearch] = useState('');
  const [title, setTitle] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const inputRef = useRef<ComponentRef<typeof Field>>(null);
  const composerWrapRef = useRef<ComponentRef<typeof View>>(null);
  const pendingFlipTop = useRef<number | null>(null);
  const pending = useRef<{ body: string; key: string; clientId: string } | null>(null);
  const sending = useRef(false);
  const creating = useRef<Promise<string> | null>(null);
  const reducedMotion = useMotionPaused();
  const profile = useProfile();
  const { pinnedIds, togglePin, unpin } = usePinnedChats(profile.data?.id);
  const credential = useCredential();
  const capabilities = useCapabilities();
  const models = useModels(!!credential.data?.configured);
  const notices = useQuery({
    queryKey: ['notices'],
    queryFn: () => api<{ id: string; read_at: string | null }[]>('/v1/notices'),
    refetchInterval: 15000,
    retry: false,
  });
  const unreadNotices = (notices.data ?? []).filter((n) => !n.read_at).length;

  useEffect(() => {
    if (profile.data) setChoice(profile.data.theme);
  }, [profile.data, setChoice]);
  useEffect(() => {
    setDraft(profile.data?.id ? (consumeDraft(profile.data.id, routeId ?? 'home') ?? '') : '');
    setSelectedFiles([]);
    setOptimisticUser(null);
    setError(null);
    pending.current = null;
    setEditingMessageId(null);
    setPassageOpenId(null);
    setAtBottom(true);
  }, [routeId, profile.data?.id]);

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
  const targetMessage = useQuery({
    queryKey: ['message-context', params.message],
    queryFn: () => api<Message[]>(`/v1/messages/${params.message}/context`),
    enabled: !!params.message,
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
  if (targetMessage.data) {
    for (const m of targetMessage.data)
      if (!visibleMessages.some((v) => v.id === m.id)) visibleMessages.push(m);
    visibleMessages.sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1));
  }

  const isHome = !routeId && !visibleMessages.length && optimisticUser === null;

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!el || typeof el.scrollHeight !== 'number') return;
    if (!draft) {
      el.style.height = '24px';
      setInputHeight(24);
      return;
    }
    el.style.height = '24px';
    const next = Math.min(200, Math.max(24, el.scrollHeight));
    el.style.height = `${next}px`;
    setInputHeight(next);
  }, [draft, wide, selectedFiles.length]);

  useLayoutEffect(() => {
    if (isHome || pendingFlipTop.current === null || Platform.OS !== 'web') return;
    const prevTop = pendingFlipTop.current;
    pendingFlipTop.current = null;
    if (reducedMotion) return;
    const el = composerWrapRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    const newTop = el.getBoundingClientRect().top;
    const dy = prevTop - newTop;
    if (Math.abs(dy) < 4) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
    void el.offsetHeight;
    el.style.transition = 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateY(0px)';
  }, [isHome, reducedMotion]);

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
    setOptimisticUser(null);
    setDraft('');
    setSelectedFiles([]);
    setError(null);
    setDrawer(false);
    if (routeId) router.replace('/');
    else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/');
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
      (!draft.trim() && !selectedFiles.length)
    )
      return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const outgoingText = draft;
    const outgoingFiles = selectedFiles;
    const startingFromHome = isHome;
    if (startingFromHome) {
      if (Platform.OS === 'web') {
        const el = composerWrapRef.current as unknown as HTMLElement | null;
        if (el && typeof el.getBoundingClientRect === 'function') {
          pendingFlipTop.current = el.getBoundingClientRect().top;
        }
      }
      setOptimisticUser(outgoingText);
      setDraft('');
      setSelectedFiles([]);
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
      if (!startingFromHome) {
        setDraft('');
        setSelectedFiles([]);
      }
      setAtBottom(true);
      cache.setQueryData(['runs', targetId], (old: Run[] | undefined) => [
        value.run,
        ...(old ?? []),
      ]);
      await cache.invalidateQueries({ queryKey: ['messages', targetId] });
      setOptimisticUser(null);
      if (!routeId) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/chat/${targetId}`);
        } else {
          router.replace(`/chat/${targetId}`);
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
      unpin(target.id);
      setDialog(null);
      setTargetChat(null);
      await cache.invalidateQueries({ queryKey: ['conversations'] });
      if (target.id === id) router.replace('/');
    } catch (e) {
      setError(e);
    }
  }

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
    (!!draft.trim() || !!selectedFiles.length);

  const webEnabled = chat.data?.enabled_tools.includes('web') ?? true;
  const webAvailable = capabilities.data?.tools.web === 'available';
  const multilineComposer =
    draft.includes('\n') || inputHeight > 28 || selectedFiles.length > 0;

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
        paddingHorizontal: 10,
        borderRadius: 17,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
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
      <Text
        style={{
          fontSize: 13,
          fontWeight: '500',
          color: webEnabled && webAvailable ? c.info : c.muted,
        }}
      >
        Tools
      </Text>
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
    <Field
      ref={inputRef}
      accessibilityLabel="Message"
      placeholder={`Ask ${BRAND_NAME}`}
      value={draft}
      onChangeText={(next) => {
        setDraft(next);
        if (!next) setInputHeight(24);
      }}
      multiline
      onContentSizeChange={(e) => {
        if (Platform.OS !== 'web') {
          setInputHeight(Math.min(200, Math.max(24, Math.ceil(e.nativeEvent.contentSize.height))));
        }
      }}
      onFocus={() => setComposerFocused(true)}
      onBlur={() => setComposerFocused(false)}
      style={{
        borderWidth: 0,
        minHeight: 24,
        height: inputHeight,
        maxHeight: 200,
        backgroundColor: 'transparent',
        outlineWidth: 0,
        paddingHorizontal: 6,
        paddingVertical: 0,
        fontSize: 16,
        lineHeight: 24,
        ...(Platform.OS === 'web'
          ? ({ overflowY: inputHeight >= 200 ? 'auto' : 'hidden', resize: 'none' } as Record<
              string,
              unknown
            >)
          : {}),
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
  );

  const composer = (
    <View
      ref={composerWrapRef}
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

      <ComposerFrame focused={composerFocused} compact={!multilineComposer}>
        <View style={{ gap: multilineComposer ? 8 : 0, position: 'relative' }}>
          <View
            style={{
              paddingLeft: multilineComposer ? 0 : 40,
              paddingRight: multilineComposer ? 0 : 122,
              minHeight: multilineComposer ? undefined : 36,
              justifyContent: 'center',
            }}
          >
            {inputField}
          </View>
          <View
            pointerEvents="box-none"
            style={
              multilineComposer
                ? { flexDirection: 'row', gap: 6, alignItems: 'center' }
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
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {toolsBtn}
              {actionBtn}
            </View>
          </View>
        </View>
      </ComposerFrame>

      {imageIncompatible && (
        <ErrorNotice error="This model cannot see photos. Choose a model with photo support." />
      )}
      <ErrorNotice error={error} />
      <Text style={{ fontSize: 12, color: c.subtle, textAlign: 'center' }}>
        Uses your OpenRouter balance. Review external actions before confirming.
      </Text>
    </View>
  );

  const conversations = history.data?.pages.flatMap((page) => page.data) ?? [];

  const sidebar = (mobile = false) => (
    <ConversationSidebar
      mobile={mobile}
      expanded={mobile || sidebarExpanded}
      selectedId={id}
      conversations={conversations}
      pinnedIds={pinnedIds}
      onToggle={() => {
        if (mobile) setDrawer(false);
        else setSidebarExpanded((value) => !value);
      }}
      onNew={() => void createChat()}
      onOpenSearch={() => {
        setDrawer(false);
        setSearchModalOpen(true);
      }}
      onSelect={(conversationId) => {
        router.replace(`/chat/${conversationId}`);
        setDrawer(false);
      }}
      onTogglePin={(item) => togglePin(item.id)}
      onRename={(item) => {
        setTargetChat(item);
        setTitle(item.title);
        setDialog('rename');
      }}
      onDelete={(item) => {
        setTargetChat(item);
        setDialog('delete');
      }}
      onWorkspace={(tab) => {
        setDrawer(false);
        router.push({ pathname: '/workspace', params: { tab } } as Href);
      }}
      onConnections={() => {
        setDrawer(false);
        setSettingsTab('connections');
      }}
      onSettings={() => {
        setDrawer(false);
        setSettingsTab('general');
      }}
      onSignOut={() => {
        setDrawer(false);
        void auth.signOut();
      }}
      displayName={profile.data?.display_name}
      unreadNotices={unreadNotices}
      busy={busy || uploading}
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
        <Dialog visible title="Source evidence" close={() => setEvidence(null)}>
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
          style={{
            height: 52,
            paddingHorizontal: wide ? 16 : 10,
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: c.background,
            zIndex: 30,
          }}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Work tools"
              onPress={() => setWorkToolsOpen((v) => !v)}
              style={({ hovered, pressed }) => ({
                width: 34,
                height: 34,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: workToolsOpen
                  ? c.selected
                  : hovered || pressed
                    ? c.hover
                    : 'transparent',
              })}
            >
              <ChatGptIcon name="sliders" size={16} color={c.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Projects & tasks"
              onPress={() => router.push('/workspace' as Href)}
              style={({ hovered, pressed }) => ({
                width: 34,
                height: 34,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hovered || pressed ? c.hover : 'transparent',
              })}
            >
              <ChatGptIcon name="projects" size={16} color={c.muted} />
            </Pressable>
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
          draft={draft}
          fileIds={selectedFiles}
          onDraft={setDraft}
          running={running}
          documentSeed={documentSeed}
          open={workToolsOpen}
          onOpenChange={setWorkToolsOpen}
        />

        <KeyboardAvoidingView
          style={{ flex: 1, position: 'relative' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {isHome ? (
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: wide ? 24 : 12,
                paddingBottom: wide ? 88 : 24,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  width: '100%',
                  maxWidth: 680,
                  marginBottom: 24,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: wide ? 28 : 24,
                    lineHeight: wide ? 36 : 32,
                    fontWeight: '500',
                    letterSpacing: -0.4,
                    color: c.greeting,
                    textAlign: 'center',
                  }}
                >
                  Ready when you are.
                </Text>
              </View>
              {composer}
            </ScrollView>
          ) : (
            <>
              <ScrollView
                ref={scroll}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: wide ? 24 : 14,
                  paddingTop: 16,
                  paddingBottom: 28,
                  gap: 24,
                  maxWidth: 792,
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
                  if (atBottom && !params.message) scroll.current?.scrollToEnd({ animated: false });
                }}
              >
                {messages.hasNextPage && (
                  <Button secondary onPress={() => void messages.fetchNextPage()}>
                    Load earlier messages
                  </Button>
                )}
                {!visibleMessages.length && optimisticUser === null && (
                  <View style={{ paddingVertical: wide ? 80 : 40, alignItems: 'center', gap: 14 }}>
                    <Text
                      style={{
                        fontSize: wide ? 28 : 24,
                        fontWeight: '500',
                        letterSpacing: -0.4,
                        color: c.greeting,
                      }}
                    >
                      Ready when you are.
                    </Text>
                  </View>
                )}
                {optimisticUser !== null && !visibleMessages.some((m) => m.role === 'user') && (
                  <>
                    <View
                      testID="chat-message"
                      style={{ alignSelf: 'flex-end', maxWidth: '78%', gap: 6 }}
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
                    </View>
                    <View testID="chat-message" style={{ alignSelf: 'stretch' }}>
                      <ThinkingSkeleton />
                    </View>
                  </>
                )}
              {visibleMessages.map((message) => {
                const isUser = message.role === 'user';
                const isEditing = isUser && editingMessageId === message.id;
                const isStreamingText =
                  !isUser && message.status === 'pending' && !!message.content;
                return (
                  <View
                    key={message.id}
                    testID="chat-message"
                    onLayout={(event) => {
                      if (params.message === message.id)
                        scroll.current?.scrollTo({
                          y: Math.max(0, event.nativeEvent.layout.y - 30),
                          animated: false,
                        });
                    }}
                    style={{
                      alignSelf: isUser ? (isEditing ? 'stretch' : 'flex-end') : 'stretch',
                      maxWidth: isUser ? (isEditing ? '100%' : '78%') : '100%',
                      gap: 6,
                      paddingLeft: params.message === message.id ? 10 : 0,
                      borderLeftWidth: params.message === message.id ? 3 : 0,
                      borderColor: c.info,
                    }}
                  >
                    {isEditing ? (
                      <View
                        style={{
                          padding: 14,
                          borderRadius: 20,
                          backgroundColor: c.userBubble,
                          gap: 10,
                        }}
                      >
                        <Field
                          accessibilityLabel="Edited message"
                          multiline
                          value={editDraft}
                          onChangeText={setEditDraft}
                          style={{
                            borderWidth: 0,
                            backgroundColor: 'transparent',
                            minHeight: 44,
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                            outlineWidth: 0,
                          }}
                        />
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Copy small muted>
                            Original chat is preserved. Reattach any files explicitly.
                          </Copy>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Button secondary onPress={() => setEditingMessageId(null)}>
                              Cancel
                            </Button>
                            <Button
                              disabled={busy || !editDraft.trim()}
                              onPress={() => {
                                setBusy(true);
                                void api<{ conversation_id: string; draft: string }>(
                                  `/v1/messages/${message.id}/branch`,
                                  json('POST', { text: editDraft }),
                                )
                                  .then((v) => {
                                    setEditingMessageId(null);
                                    if (profile.data?.id)
                                      transferDraft(profile.data.id, v.conversation_id, v.draft);
                                    router.push({
                                      pathname: '/chat/[id]',
                                      params: { id: v.conversation_id },
                                    });
                                  })
                                  .catch(setError)
                                  .finally(() => setBusy(false));
                              }}
                            >
                              Create branch
                            </Button>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View
                        testID={isUser ? 'user-message-bubble' : 'assistant-message-body'}
                        style={{
                          gap: 10,
                          paddingHorizontal: isUser ? 18 : 0,
                          paddingVertical: isUser ? 11 : 0,
                          borderRadius: 22,
                          backgroundColor: isUser ? c.userBubble : 'transparent',
                        }}
                      >
                        {message.content ? (
                          <View style={{ gap: 6 }}>
                            <StreamingMarkdown
                              text={message.content}
                              streaming={!isUser && message.status === 'pending'}
                              onCitation={
                                message.run_id
                                  ? (cid) => setEvidence({ run: message.run_id!, citation: cid })
                                  : undefined
                              }
                            />
                            {isStreamingText && (
                              <View
                                testID="streaming-cursor"
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 5,
                                  backgroundColor: c.text,
                                }}
                              />
                            )}
                          </View>
                        ) : message.status === 'pending' ? (
                          <ThinkingSkeleton />
                        ) : null}
                        {message.file_ids.map((fileId) => (
                          <Attachment
                            key={fileId}
                            id={fileId}
                            large={!isUser}
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
                    )}

                    {!isEditing &&
                      (message.content || (!isUser && message.status !== 'pending')) && (
                        <MessageActions
                          text={message.content}
                          assistant={!isUser}
                          canRetry={
                            !running &&
                            message.id ===
                              (snapshot.data?.run.assistant_message_id ??
                                latest?.assistant_message_id)
                          }
                          busy={busy || running}
                          onRetry={() => setDialog('retry')}
                          onEdit={
                            isUser
                              ? () => {
                                  setEditDraft(message.content);
                                  setEditingMessageId(message.id);
                                }
                              : undefined
                          }
                          onWorkWithResponse={
                            !isUser && message.status !== 'pending' && !!message.content
                              ? () =>
                                  setPassageOpenId((cur) => (cur === message.id ? null : message.id))
                              : undefined
                          }
                          onSaveDocument={
                            !isUser && message.status !== 'pending' && !!message.content
                              ? () =>
                                  setDocumentSeed({
                                    text: message.content,
                                    key: Crypto.randomUUID(),
                                  })
                              : undefined
                          }
                          onError={setError}
                        />
                      )}
                    {!isUser && message.status !== 'pending' && !!message.content && (
                      <PassageActions
                        text={message.content}
                        open={passageOpenId === message.id}
                        onClose={() => setPassageOpenId(null)}
                        onDraft={setDraft}
                      />
                    )}
                  </View>
                );
              })}

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
            </ScrollView>

            {!atBottom && (
              <View style={{ position: 'absolute', bottom: 136, alignSelf: 'center', zIndex: 15 }}>
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
            {composer}
            </>
          )}
        </KeyboardAvoidingView>
      </View>

      <ConversationDrawer visible={drawer && !wide} close={() => setDrawer(false)}>
        {sidebar(true)}
      </ConversationDrawer>

      <SearchModal
        visible={searchModalOpen}
        close={() => setSearchModalOpen(false)}
        conversations={conversations}
        onSelectChat={(cid) => router.replace(`/chat/${cid}`)}
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
