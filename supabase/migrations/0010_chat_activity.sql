-- Server-side pinning and per-conversation activity state (CHAT-203).
-- pinned_at: when the owner pinned the chat; null when not pinned.
-- last_seen_at: last time the owner viewed the chat; drives the unread indicator.
ALTER TABLE conversations ADD COLUMN pinned_at timestamptz NULL;
ALTER TABLE conversations ADD COLUMN last_seen_at timestamptz NULL;

-- Existing chats were already read before this migration, so they start as seen.
UPDATE conversations SET last_seen_at = now();

CREATE INDEX conversations_owner_pinned_idx
  ON conversations (owner_id, pinned_at DESC, id)
  WHERE pinned_at IS NOT NULL;
