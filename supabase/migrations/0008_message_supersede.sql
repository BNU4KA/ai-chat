ALTER TABLE messages ADD COLUMN superseded_at timestamptz;

CREATE INDEX messages_visible_seq_idx ON messages (conversation_id, seq) WHERE superseded_at IS NULL;
