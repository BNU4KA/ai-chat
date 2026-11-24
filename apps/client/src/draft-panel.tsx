import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, json } from './api';
import { applyMarkup, blocksToMarkdown, markdownToBlocks, type MarkupKind } from './draft-markdown';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import type { DocumentDraft } from './types';
import { Button, Copy, ErrorNotice, Field } from './ui';

export const DRAFT_PANEL_WIDTH = 440;
const DRAFT_PANEL_MIN_WIDTH = 360;
const DRAFT_PANEL_MAX_WIDTH = 900;
// Height of the chat header; the panel starts below it so the header never covers its controls.
const HEADER_OFFSET = 52;

const MARKUP: { kind: MarkupKind; label: string; name: string }[] = [
  { kind: 'heading', label: 'H', name: 'Heading' },
  { kind: 'bold', label: 'B', name: 'Bold' },
  { kind: 'bullet', label: '•', name: 'Bulleted list' },
  { kind: 'numbered', label: '1.', name: 'Numbered list' },
];

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
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const markdownField = useRef<ComponentRef<typeof Field>>(null);
  const [state, setState] = useState<SaveState>(draft.status === 'created' ? 'created' : 'saved');
  const [version, setVersion] = useState(draft.version);
  const [error, setError] = useState<unknown>(null);
  const versionRef = useRef(draft.version);
  const saved = useRef({ title: draft.title, markdown: blocksToMarkdown(draft.content.blocks) });
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const locked = state === 'created';
  const dirty = title.trim() !== saved.current.title || markdown !== saved.current.markdown;

  function apply(kind: MarkupKind) {
    if (locked) return;
    const next = applyMarkup(markdown, selection.start, selection.end, kind);
    setMarkdown(next.text);
    setSelection({ start: next.start, end: next.end });
    requestAnimationFrame(() => {
      const node = markdownField.current as {
        focus?: () => void;
        setSelectionRange?: (start: number, end: number) => void;
      } | null;
      node?.focus?.();
      node?.setSelectionRange?.(next.start, next.end);
    });
  }

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
      <View style={styles.editor}>
        <ErrorNotice error={error} />
        <Field
          accessibilityLabel="Draft title"
          value={title}
          onChangeText={setTitle}
          editable={!locked}
          maxLength={200}
        />
        {!locked && (
          <View style={[styles.plaque, { borderColor: c.border, backgroundColor: c.raised }]}>
            {MARKUP.map((item) => (
              <Pressable
                key={item.kind}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                onPress={() => apply(item.kind)}
                style={({ hovered, pressed }) => [
                  styles.plaqueButton,
                  { backgroundColor: hovered || pressed ? c.hover : 'transparent' },
                ]}
              >
                <Text style={[styles.plaqueLabel, { color: c.text }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Field
          ref={markdownField}
          accessibilityLabel="Draft markdown"
          value={markdown}
          onChangeText={setMarkdown}
          onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
          editable={!locked}
          multiline
          textAlignVertical="top"
          style={[styles.paper, { backgroundColor: c.surface }]}
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

interface DraftLinkProps {
  title: string;
  format: string;
  created: boolean;
  onOpen: () => void;
}

export function DraftLink({ title, format, created, onOpen }: DraftLinkProps) {
  const { colors: c } = useTheme();
  const action = created ? 'Download' : 'Review';
  return (
    <Pressable
      testID="draft-link"
      accessibilityRole="button"
      accessibilityLabel={created ? `Open file ${title}` : `Open draft ${title}`}
      onPress={onOpen}
      style={({ hovered, pressed }) => [
        styles.link,
        {
          borderColor: c.border,
          backgroundColor: hovered || pressed ? c.hover : c.surface,
        },
      ]}
    >
      <View style={[styles.page, { borderColor: c.border, backgroundColor: c.raised }]}>
        <Text style={[styles.pageLabel, { color: created ? c.success : c.info }]}>
          {format.toUpperCase()}
        </Text>
      </View>
      <View style={styles.linkText}>
        <Text numberOfLines={1} style={[styles.linkTitle, { color: c.text }]}>
          {title}
        </Text>
        <Text style={[styles.linkMeta, { color: c.muted }]}>{created ? 'File ready' : 'Draft'}</Text>
      </View>
      <View
        style={[
          styles.action,
          { backgroundColor: created ? c.accent : c.infoSoft },
        ]}
      >
        <Text style={[styles.actionLabel, { color: created ? c.accentText : c.info }]}>{action}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editor: { flex: 1, padding: 14, gap: 12 },
  plaque: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  plaqueButton: {
    minWidth: 36,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plaqueLabel: { fontSize: 14, fontWeight: '700' },
  paper: {
    flex: 1,
    minHeight: 240,
    paddingTop: 14,
    borderRadius: 16,
    fontSize: 15,
    lineHeight: 22,
  },
  link: {
    alignSelf: 'flex-start',
    maxWidth: 420,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 16,
  },
  page: {
    width: 44,
    height: 52,
    borderWidth: 1,
    borderRadius: 6,
    borderTopRightRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  linkText: { flex: 1, gap: 2, minWidth: 0 },
  linkTitle: { fontSize: 14, fontWeight: '600' },
  linkMeta: { fontSize: 12 },
  action: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, fontWeight: '600' },
});
