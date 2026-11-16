import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, json } from './api';
import { blocksToMarkdown, markdownToBlocks } from './draft-markdown';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import type { DocumentDraft } from './types';
import { Button, Copy, ErrorNotice, Field } from './ui';

export const DRAFT_PANEL_WIDTH = 440;
const DRAFT_PANEL_MIN_WIDTH = 360;
const DRAFT_PANEL_MAX_WIDTH = 900;
// Height of the chat header; the panel starts below it so the header never covers its controls.
const HEADER_OFFSET = 52;
const MONO_FONT = Platform.select({
  web: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  default: 'monospace',
});

export function clampDraftPanelWidth(width: number, windowWidth: number) {
  const max = Math.max(
    DRAFT_PANEL_MIN_WIDTH,
    Math.min(DRAFT_PANEL_MAX_WIDTH, Math.round(windowWidth * 0.7)),
  );
  return Math.min(max, Math.max(DRAFT_PANEL_MIN_WIDTH, Math.round(width)));
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'created';

const statusText: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Could not save',
  created: 'File created',
};

export function DraftPanel({
  draftId,
  width,
  onWidthChange,
  onClose,
}: {
  draftId: string;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const wide = windowWidth >= 1024;
  const inset = useSafeAreaInsets();
  const topOffset = HEADER_OFFSET + (inset.top || 0);
  const query = useQuery({
    queryKey: ['document-draft', draftId],
    queryFn: () => api<DocumentDraft>(`/v1/document-drafts/${draftId}`),
  });
  const [resizing, setResizing] = useState(false);
  const latest = useRef({ width, windowWidth, onWidthChange });
  latest.current = { width, windowWidth, onWidthChange };
  const dragStart = useRef(width);
  // The handle drags the left edge: moving left widens the panel.
  const resizer = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStart.current = latest.current.width;
          setResizing(true);
        },
        onPanResponderMove: (_, gesture) => {
          const { windowWidth: screen, onWidthChange: change } = latest.current;
          change(clampDraftPanelWidth(dragStart.current - gesture.dx, screen));
        },
        onPanResponderRelease: () => setResizing(false),
        onPanResponderTerminate: () => setResizing(false),
      }),
    [],
  );
  const shell = wide
    ? {
        position: 'absolute' as const,
        top: 0,
        right: 0,
        bottom: 0,
        width,
        borderLeftWidth: 1,
        borderColor: c.border,
      }
    : { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
  return (
    <View
      testID="draft-panel"
      accessibilityLabel="Document draft"
      style={[shell, { zIndex: 45, backgroundColor: c.background, paddingTop: topOffset }]}
    >
      {query.data ? (
        <DraftEditor key={query.data.id} draft={query.data} onClose={onClose} />
      ) : (
        <Copy muted>{query.error ? String(query.error) : 'Loading draft…'}</Copy>
      )}
      {wide && (
        <View
          {...resizer.panHandlers}
          testID="draft-panel-resize"
          accessibilityRole="separator"
          accessibilityLabel="Resize draft panel"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: -3,
              width: 6,
              zIndex: 1,
              backgroundColor: resizing ? c.info : 'transparent',
            },
            Platform.OS === 'web' ? ({ cursor: 'col-resize' } as object) : null,
          ]}
        />
      )}
    </View>
  );
}

function DraftEditor({ draft, onClose }: { draft: DocumentDraft; onClose: () => void }) {
  const cache = useQueryClient();
  const { colors: c } = useTheme();
  const [title, setTitle] = useState(draft.title);
  const [markdown, setMarkdown] = useState(() => blocksToMarkdown(draft.content.blocks));
  const [state, setState] = useState<SaveState>(draft.status === 'created' ? 'created' : 'saved');
  const [version, setVersion] = useState(draft.version);
  const [error, setError] = useState<unknown>(null);
  const versionRef = useRef(draft.version);
  const saved = useRef({ title: draft.title, markdown: blocksToMarkdown(draft.content.blocks) });
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const locked = state === 'created';
  const dirty = title.trim() !== saved.current.title || markdown !== saved.current.markdown;

  // Writes run one at a time, so each sends the version returned by the previous write.
  function save(nextTitle: string, nextMarkdown: string): Promise<boolean> {
    chain.current = chain.current.then(async () => {
      const body = {
        title: nextTitle.trim(),
        content: { blocks: markdownToBlocks(nextMarkdown) },
      };
      if (body.title === saved.current.title && nextMarkdown === saved.current.markdown) return true;
      if (!body.title || body.content.blocks.length === 0) {
        setError(new Error('A draft needs a title and some text.'));
        setState('error');
        return false;
      }
      setState('saving');
      try {
        const next = await api<DocumentDraft>(
          `/v1/document-drafts/${draft.id}`,
          json('PATCH', body, versionRef.current),
        );
        versionRef.current = next.version;
        setVersion(next.version);
        saved.current = { title: next.title, markdown: nextMarkdown };
        setError(null);
        setState('saved');
        void cache.invalidateQueries({ queryKey: ['document-drafts', draft.conversation_id] });
        return true;
      } catch (e) {
        setError(e);
        setState('error');
        return false;
      }
    });
    return chain.current;
  }

  useEffect(() => {
    if (locked || !dirty) return;
    setState('unsaved');
    const timer = setTimeout(() => void save(title, markdown), 800);
    return () => clearTimeout(timer);
    // The timer restarts on every edit; save reads the values from this render.
  }, [title, markdown]);

  async function close() {
    if (dirty && !(await save(title, markdown))) return;
    onClose();
  }

  async function createFile() {
    if (!(await save(title, markdown))) return;
    setState('saving');
    try {
      await api(`/v1/document-drafts/${draft.id}/create`, { method: 'POST' });
      setError(null);
      setState('created');
      void cache.invalidateQueries({ queryKey: ['document-drafts', draft.conversation_id] });
      void cache.invalidateQueries({ queryKey: ['messages', draft.conversation_id] });
      void cache.invalidateQueries({ queryKey: ['document-draft', draft.id] });
    } catch (e) {
      setError(e);
      setState('error');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        <Button secondary onPress={() => void close()}>
          Back
        </Button>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: c.muted }}>
            {draft.format.toUpperCase()} · version {version} · {statusText[state]}
          </Text>
        </View>
        {!locked && (
          <Button disabled={state === 'saving'} onPress={() => void createFile()}>
            Create file
          </Button>
        )}
      </View>
      <View style={{ flex: 1, padding: 14, gap: 12 }}>
        <ErrorNotice error={error} />
        <Field
          accessibilityLabel="Draft title"
          value={title}
          onChangeText={setTitle}
          editable={!locked}
          maxLength={200}
        />
        <Field
          accessibilityLabel="Draft markdown"
          value={markdown}
          onChangeText={setMarkdown}
          editable={!locked}
          multiline
          textAlignVertical="top"
          style={{
            flex: 1,
            minHeight: 200,
            paddingTop: 12,
            fontFamily: MONO_FONT,
            fontSize: 14,
            lineHeight: 21,
          }}
        />
        {locked ? (
          <Copy small muted>
            The file was created from this draft. Ask the assistant for a revised copy to change it.
          </Copy>
        ) : (
          <Copy small muted>
            Markdown: # heading, - bullets, 1. numbered items, | tables |. A blank line starts a new
            paragraph.
          </Copy>
        )}
      </View>
    </View>
  );
}

export function DraftLink({
  title,
  format,
  onOpen,
}: {
  title: string;
  format: string;
  onOpen: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      testID="draft-link"
      accessibilityRole="button"
      accessibilityLabel={`Open draft ${title}`}
      onPress={onOpen}
      style={({ hovered, pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 64,
        paddingLeft: 10,
        paddingRight: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: hovered || pressed ? c.info : c.border,
        backgroundColor: hovered || pressed ? c.hover : c.raised,
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.infoSoft,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: c.info }}>
          {format.toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: c.muted }}>
          {format.toUpperCase()} draft · Open to review and edit
        </Text>
      </View>
      <Text style={{ fontSize: 20, color: c.info }}>›</Text>
    </Pressable>
  );
}
