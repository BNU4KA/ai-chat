-- Short follow-up replies suggested by the model for a completed assistant answer (CHAT-204).
ALTER TABLE messages ADD COLUMN suggestions jsonb NULL;
