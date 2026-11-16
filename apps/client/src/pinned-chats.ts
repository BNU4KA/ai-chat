import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Conversation } from './types';

export function usePinnedChats() {
  const cache = useQueryClient();
  const pinned = useQuery({
    queryKey: ['conversations', 'pinned'],
    queryFn: () => api<Conversation[]>('/v1/conversations?pinned=true'),
  });
  const pinnedItems = (pinned.data ?? []).filter((item) => item.pinned_at);
  const pinnedIds = pinnedItems.map((item) => item.id);

  const pin = useMutation({
    mutationFn: ({ id, pinned: next }: { id: string; pinned: boolean }) =>
      api<Conversation>(`/v1/conversations/${id}/pin`, { method: next ? 'PUT' : 'DELETE' }),
    onSettled: () => cache.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const togglePin = (conversationId: string) =>
    pin.mutate({ id: conversationId, pinned: !pinnedIds.includes(conversationId) });

  return { pinnedIds, pinned: pinnedItems, togglePin };
}
