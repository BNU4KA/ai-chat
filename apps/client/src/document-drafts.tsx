import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import { Copy } from './ui';
import type { DocumentDraft } from './types';

export function DocumentDrafts({
  conversationId,
  onOpen,
}: {
  conversationId: string;
  onOpen: (draftId: string) => void;
}) {
  const { colors: c } = useTheme();
  const list = useQuery({
    queryKey: ['document-drafts', conversationId],
    queryFn: () => api<DocumentDraft[]>(`/v1/conversations/${conversationId}/document-drafts`),
  });
  const drafts = list.data ?? [];
  return (
    <View style={{ gap: 10 }}>
      {!drafts.length && !list.isPending && (
        <Copy muted>When the assistant drafts a Word or PDF file, it appears here for review.</Copy>
      )}
      {drafts.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Open draft ${item.title}`}
          onPress={() => onOpen(item.id)}
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
