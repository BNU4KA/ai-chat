import { useEffect, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DocumentBlock } from '@ai-chat/contracts';
import { api, json } from './api';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import type { DocumentDraft } from './types';
import { Button, Copy, ErrorNotice, Field } from './ui';

export const DRAFT_PANEL_WIDTH = 440;
// Height of the chat header; the panel starts below it so the header never covers its controls.
const HEADER_OFFSET = 52;

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'created';

const statusText: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Could not save',
  created: 'File created',
};

export function DraftPanel({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const inset = useSafeAreaInsets();
  const topOffset = HEADER_OFFSET + (inset.top || 0);
  const query = useQuery({
    queryKey: ['document-draft', draftId],
    queryFn: () => api<DocumentDraft>(`/v1/document-drafts/${draftId}`),
  });
  const shell = wide
    ? {
        position: 'absolute' as const,
        top: 0,
        right: 0,
        bottom: 0,
        width: DRAFT_PANEL_WIDTH,
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
    </View>
  );
}

function DraftEditor({ draft, onClose }: { draft: DocumentDraft; onClose: () => void }) {
  const cache = useQueryClient();
  const { colors: c } = useTheme();
  const [title, setTitle] = useState(draft.title);
  const [blocks, setBlocks] = useState<DocumentBlock[]>(draft.content.blocks);
  const [state, setState] = useState<SaveState>(draft.status === 'created' ? 'created' : 'saved');
  const [version, setVersion] = useState(draft.version);
  const [error, setError] = useState<unknown>(null);
  const versionRef = useRef(draft.version);
  const saved = useRef({ title: draft.title, blocks: JSON.stringify(draft.content.blocks) });
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const locked = state === 'created';
  const dirty =
    title.trim() !== saved.current.title || JSON.stringify(blocks) !== saved.current.blocks;

  // Writes run one at a time, so each sends the version returned by the previous write.
  function save(nextTitle: string, nextBlocks: DocumentBlock[]): Promise<boolean> {
    chain.current = chain.current.then(async () => {
      const body = { title: nextTitle.trim(), content: { blocks: nextBlocks } };
      if (body.title === saved.current.title && JSON.stringify(nextBlocks) === saved.current.blocks)
        return true;
      if (!body.title || nextBlocks.length === 0) {
        setError(new Error('A draft needs a title and at least one block.'));
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
        saved.current = { title: next.title, blocks: JSON.stringify(next.content.blocks) };
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
    const timer = setTimeout(() => void save(title, blocks), 800);
    return () => clearTimeout(timer);
    // The timer restarts on every edit; save reads the values from this render.
  }, [title, blocks]);

  async function close() {
    if (dirty && !(await save(title, blocks))) return;
    onClose();
  }

  async function createFile() {
    if (!(await save(title, blocks))) return;
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

  function addBlock(kind: 'paragraph' | 'heading' | 'list' | 'table') {
    const block: DocumentBlock =
      kind === 'paragraph'
        ? { type: 'paragraph', text: '' }
        : kind === 'heading'
          ? { type: 'heading', level: 2, text: '' }
          : kind === 'list'
            ? { type: 'list', ordered: false, items: [''] }
            : { type: 'table', header: ['Item', 'Value'], rows: [['', '']] };
    setBlocks((old) => [...old, block]);
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
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <ErrorNotice error={error} />
        <Field
          accessibilityLabel="Draft title"
          value={title}
          onChangeText={setTitle}
          editable={!locked}
          maxLength={200}
        />
        {blocks.map((block, index) => (
          <BlockEditor
            key={index}
            block={block}
            editable={!locked}
            canRemove={blocks.length > 1}
            onChange={(next) => setBlocks((old) => old.map((item, i) => (i === index ? next : item)))}
            onRemove={() => setBlocks((old) => old.filter((_, i) => i !== index))}
          />
        ))}
        {!locked && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button secondary onPress={() => addBlock('paragraph')}>
              Add paragraph
            </Button>
            <Button secondary onPress={() => addBlock('heading')}>
              Add heading
            </Button>
            <Button secondary onPress={() => addBlock('list')}>
              Add list
            </Button>
            <Button secondary onPress={() => addBlock('table')}>
              Add table
            </Button>
          </View>
        )}
        {locked && (
          <Copy small muted>
            The file was created from this draft. Ask the assistant for a revised copy to change it.
          </Copy>
        )}
      </ScrollView>
    </View>
  );
}

function BlockEditor({
  block,
  editable,
  canRemove,
  onChange,
  onRemove,
}: {
  block: DocumentBlock;
  editable: boolean;
  canRemove: boolean;
  onChange: (block: DocumentBlock) => void;
  onRemove: () => void;
}) {
  const { colors: c } = useTheme();
  const label =
    block.type === 'heading'
      ? 'Heading'
      : block.type === 'paragraph'
        ? 'Paragraph'
        : block.type === 'list'
          ? block.ordered
            ? 'Numbered list'
            : 'Bulleted list'
          : 'Table';
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: c.muted }}>{label}</Text>
        {block.type === 'list' && editable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle numbered list"
            onPress={() => onChange({ ...block, ordered: !block.ordered })}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <Text style={{ fontSize: 13, color: c.info }}>
              {block.ordered ? 'Use bullets' : 'Use numbers'}
            </Text>
          </Pressable>
        )}
        {editable && canRemove && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label.toLowerCase()}`}
            onPress={onRemove}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <Text style={{ fontSize: 13, color: c.danger }}>Remove</Text>
          </Pressable>
        )}
      </View>
      {block.type === 'heading' && (
        <Field
          accessibilityLabel="Heading text"
          value={block.text}
          editable={editable}
          onChangeText={(text) => onChange({ ...block, text })}
          maxLength={300}
        />
      )}
      {block.type === 'paragraph' && (
        <Field
          accessibilityLabel="Paragraph text"
          value={block.text}
          editable={editable}
          multiline
          onChangeText={(text) => onChange({ ...block, text })}
          maxLength={4000}
          style={{ minHeight: 80 }}
        />
      )}
      {block.type === 'list' && (
        <View style={{ gap: 6 }}>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Field
                accessibilityLabel={`List item ${index + 1}`}
                value={item}
                editable={editable}
                onChangeText={(text) =>
                  onChange({ ...block, items: block.items.map((old, i) => (i === index ? text : old)) })
                }
                maxLength={1000}
                style={{ flex: 1 }}
              />
              {editable && block.items.length > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove list item ${index + 1}`}
                  onPress={() =>
                    onChange({ ...block, items: block.items.filter((_, i) => i !== index) })
                  }
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 18, color: c.muted }}>×</Text>
                </Pressable>
              )}
            </View>
          ))}
          {editable && block.items.length < 100 && (
            <Button secondary onPress={() => onChange({ ...block, items: [...block.items, ''] })}>
              Add item
            </Button>
          )}
        </View>
      )}
      {block.type === 'table' && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {block.header.map((cell, column) => (
              <Field
                key={column}
                accessibilityLabel={`Table header ${column + 1}`}
                value={cell}
                editable={editable}
                onChangeText={(text) =>
                  onChange({
                    ...block,
                    header: block.header.map((old, i) => (i === column ? text : old)),
                  })
                }
                maxLength={300}
                style={{ flex: 1, fontWeight: '600' }}
              />
            ))}
          </View>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {row.map((cell, column) => (
                <Field
                  key={column}
                  accessibilityLabel={`Table cell ${rowIndex + 1}-${column + 1}`}
                  value={cell}
                  editable={editable}
                  onChangeText={(text) =>
                    onChange({
                      ...block,
                      rows: block.rows.map((old, r) =>
                        r === rowIndex ? old.map((value, i) => (i === column ? text : value)) : old,
                      ),
                    })
                  }
                  maxLength={300}
                  style={{ flex: 1 }}
                />
              ))}
              {editable && block.rows.length > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove table row ${rowIndex + 1}`}
                  onPress={() =>
                    onChange({ ...block, rows: block.rows.filter((_, r) => r !== rowIndex) })
                  }
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 18, color: c.muted }}>×</Text>
                </Pressable>
              )}
            </View>
          ))}
          {editable && block.rows.length < 200 && (
            <Button
              secondary
              onPress={() => onChange({ ...block, rows: [...block.rows, block.header.map(() => '')] })}
            >
              Add row
            </Button>
          )}
        </View>
      )}
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
        minHeight: 44,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: hovered || pressed ? c.hover : c.raised,
        justifyContent: 'center',
        gap: 2,
      })}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{title}</Text>
      <Text style={{ fontSize: 12, color: c.muted }}>
        {format.toUpperCase()} draft · Open to review and edit
      </Text>
    </Pressable>
  );
}
