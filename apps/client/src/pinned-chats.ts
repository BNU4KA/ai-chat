import { useCallback, useEffect, useState } from 'react';
import { sessionStorage } from './session-storage';

const STORAGE_PREFIX = 'ai-chat:pinned:';

export function usePinnedChats(userId?: string | null) {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setPinnedIds([]);
      return;
    }
    void sessionStorage.getItem(`${STORAGE_PREFIX}${userId}`).then((raw) => {
      if (!active) return;
      if (!raw) {
        setPinnedIds([]);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setPinnedIds(parsed.filter((v): v is string => typeof v === 'string'));
        }
      } catch {
        setPinnedIds([]);
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const togglePin = useCallback(
    (conversationId: string) => {
      setPinnedIds((prev) => {
        const next = prev.includes(conversationId)
          ? prev.filter((id) => id !== conversationId)
          : [conversationId, ...prev];
        if (userId) {
          void sessionStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(next));
        }
        return next;
      });
    },
    [userId],
  );

  const unpin = useCallback(
    (conversationId: string) => {
      setPinnedIds((prev) => {
        if (!prev.includes(conversationId)) return prev;
        const next = prev.filter((id) => id !== conversationId);
        if (userId) {
          void sessionStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(next));
        }
        return next;
      });
    },
    [userId],
  );

  return { pinnedIds, togglePin, unpin };
}
