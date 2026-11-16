-- Editable document drafts written by the model before a file is created (CHAT-207).
-- A draft is owner- and conversation-scoped; its content is structured blocks, as in create_document.
-- After a file is created the draft becomes read-only; further revisions use the existing revision path.
CREATE TABLE document_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  assistant_message_id uuid NULL,
  format text NOT NULL CHECK (format IN ('docx', 'pdf')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'created')),
  file_id uuid NULL,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  FOREIGN KEY (conversation_id, owner_id) REFERENCES conversations (id, owner_id) ON DELETE CASCADE
);
CREATE INDEX document_drafts_conversation_idx ON document_drafts (conversation_id, owner_id, updated_at DESC);

ALTER TABLE document_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON document_drafts TO app_api
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY worker_access ON document_drafts TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON document_drafts TO app_api, app_worker;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON document_drafts FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON document_drafts FROM authenticated; END IF;
END $$;
