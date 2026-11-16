-- Reasoning effort chosen for a conversation; null means the provider default (CHAT-206).
ALTER TABLE conversations
  ADD COLUMN reasoning_effort text NULL CHECK (reasoning_effort IN ('low', 'medium', 'high'));
