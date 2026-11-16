import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentBlock } from '@ai-chat/contracts';
import { api, json } from './api';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import { Button, Copy, ErrorNotice, Field } from './ui';
import type { DocumentDraft } from './types';

export function DocumentDrafts({ conversationId }: { conversationId: string }) {
  const { colors: c } = useTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const list = useQuery({
    queryKey: ['document-drafts', conversationId],
    queryFn: () => api<DocumentDraft[]>(`/v1/conversations/${conversationId}/document-drafts`),
  });
  const drafts = list.data ?? [];
  const selected = drafts.find((item) => item.id === selectedId) ?? null;

  if (selected) {
    return (
      <DraftEditor
        key={`${selected.id}:${selected.version}`}
        draft={selected}
        onBack={() => setSelectedId(null)}
        onError={setError}
        error={error}
      />
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <ErrorNotice error={error} />
      {!drafts.length && !list.isPending && (
        <Copy muted>When the assistant drafts a Word or PDF file, it appears here for review.</Copy>
      )}
      {drafts.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Open draft ${item.title}`}
          onPress={() => setSelectedId(item.id)}
          style={({ hovered, pressed }) => ({
            minHeight: 44,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: pressed || hovered ? c.hover : c.raised,
            gap: 4,
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.title}</Text>
          <Text style={{ fontSize: 12, color: c.muted }}>
            {item.format.toUpperCase()} · {item.status === 'created' ? 'File created' : 'Draft'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function DraftEditor({
  draft,
  onBack,
  onError,
  error,
}: {
  draft: DocumentDraft;
  onBack: () => void;
  onError: (error: unknown) => void;
  error: unknown;
}) {
  const cache = useQueryClient();
  const [title, setTitle] = useState(draft.title);
  const [blocks, setBlocks] = useState<DocumentBlock[]>(draft.content.blocks);
  const [busy, setBusy] = useState(false);
  const locked = draft.status === 'created';
  const dirty =
    title !== draft.title || JSON.stringify(blocks) !== JSON.stringify(draft.content.blocks);

  useEffect(() => {
    setTitle(draft.title);
    setBlocks(draft.content.blocks);
  }, [draft]);

  async function save() {
    setBusy(true);
    try {
      await api<DocumentDraft>(
        `/v1/document-drafts/${draft.id}`,
        json('PATCH', { title: title.trim(), content: { blocks } }, draft.version),
      );
      await cache.invalidateQueries({ queryKey: ['document-drafts', draft.conversation_id] });
      onError(null);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  async function createFile() {
    setBusy(true);
    try {
      if (dirty) await save();
      await api<DocumentDraft>(`/v1/document-drafts/${draft.id}/create`, { method: 'POST' });
      await cache.invalidateQueries({ queryKey: ['document-drafts', draft.conversation_id] });
      await cache.invalidateQueries({ queryKey: ['messages', draft.conversation_id] });
      onError(null);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 12 }}>
      <Button secondary onPress={onBack}>
        Back to drafts
      </Button>
      <ErrorNotice error={error} />
      <Field
        accessibilityLabel="Draft title"
        value={title}
        onChangeText={setTitle}
        editable={!locked}
        maxLength={200}
      />
      {blocks.map((block, index) => {
        if (block.type === 'heading' || block.type === 'paragraph')
          return (
            <Field
              key={index}
              accessibilityLabel={`${block.type === 'heading' ? 'Heading' : 'Paragraph'} ${index + 1}`}
              value={block.text}
              multiline
              editable={!locked}
              onChangeText={(text) =>
                setBlocks((old) =>
                  old.map((item, i) => (i === index ? { ...item, text } : item)),
                )
              }
              style={{ minHeight: 44 }}
            />
          );
        return (
          <Copy key={index} small muted>
            {block.type === 'list' ? 'List' : 'Table'} blocks are shown as saved and not editable here.
          </Copy>
        );
      })}
      {locked ? (
        <Copy small muted>
          The file was created from this draft. Ask the assistant for a revised copy to change it.
        </Copy>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button secondary disabled={!dirty || busy} onPress={() => void save()}>
            Save draft
          </Button>
          <Button disabled={busy} onPress={() => void createFile()}>
            Create file
          </Button>
        </View>
      )}
    </ScrollView>
  );
}
