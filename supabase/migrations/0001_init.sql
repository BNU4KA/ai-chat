CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT app_api TO CURRENT_USER;
GRANT app_worker TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO app_api, app_worker;

CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  display_name text,
  avatar_url text,
  locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'UTC',
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  deletion_requested_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles (id),
  provider text NOT NULL CHECK (provider = 'google'),
  google_subject text,
  account_email text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('connected', 'reauth_required', 'disconnecting', 'disconnected')),
  last_error_code text,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (owner_id)
);

CREATE TABLE encrypted_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles (id),
  provider text NOT NULL CHECK (provider IN ('openrouter', 'google')),
  integration_id uuid,
  credential_version int NOT NULL CHECK (credential_version >= 1),
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  auth_tag bytea NOT NULL,
  encryption_key_version text NOT NULL,
  last_four text,
  validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (integration_id, owner_id) REFERENCES integrations (id, owner_id)
);

CREATE UNIQUE INDEX encrypted_credentials_one_openrouter
  ON encrypted_credentials (owner_id)
  WHERE provider = 'openrouter';

CREATE UNIQUE INDEX encrypted_credentials_one_google
  ON encrypted_credentials (owner_id)
  WHERE provider = 'google';

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles (id),
  title text NOT NULL,
  title_source text NOT NULL CHECK (title_source IN ('auto', 'manual')),
  model_id text,
  enabled_tools text[] NOT NULL DEFAULT '{}',
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  CONSTRAINT conversations_tools_chk CHECK (
    enabled_tools <@ ARRAY['web', 'files', 'gmail', 'calendar']::text[]
  )
);

CREATE INDEX conversations_owner_updated_idx
  ON conversations (owner_id, updated_at DESC, id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  run_id uuid,
  seq bigint NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'partial', 'failed', 'cancelled')),
  client_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (conversation_id, seq),
  FOREIGN KEY (conversation_id, owner_id) REFERENCES conversations (id, owner_id)
);

CREATE UNIQUE INDEX messages_client_id_idx
  ON messages (owner_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX messages_conversation_seq_idx ON messages (conversation_id, seq);

CREATE TABLE runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_message_id uuid NOT NULL,
  assistant_message_id uuid NOT NULL,
  attempt int NOT NULL CHECK (attempt >= 1),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'waiting_approval', 'completed', 'cancelled', 'failed')),
  model_id text NOT NULL,
  tool_snapshot jsonb NOT NULL,
  credential_version int NOT NULL,
  cancel_requested_at timestamptz,
  execution_ms int NOT NULL DEFAULT 0,
  model_calls int NOT NULL DEFAULT 0,
  tool_calls int NOT NULL DEFAULT 0,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  usage jsonb NOT NULL DEFAULT '{"input_tokens":null,"output_tokens":null,"cost_usd":null,"cost_status":"unknown","provider_generation_ids":[]}'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (user_message_id, attempt),
  FOREIGN KEY (conversation_id, owner_id) REFERENCES conversations (id, owner_id),
  FOREIGN KEY (user_message_id, owner_id) REFERENCES messages (id, owner_id),
  FOREIGN KEY (assistant_message_id, owner_id) REFERENCES messages (id, owner_id)
);

CREATE UNIQUE INDEX runs_one_active_idx
  ON runs (conversation_id)
  WHERE status IN ('queued', 'running', 'waiting_approval');

CREATE INDEX runs_owner_status_idx ON runs (owner_id, status);

ALTER TABLE messages
  ADD CONSTRAINT messages_run_fk
  FOREIGN KEY (run_id, owner_id) REFERENCES runs (id, owner_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  run_id uuid NOT NULL,
  seq bigint NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  emitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq),
  FOREIGN KEY (run_id, owner_id) REFERENCES runs (id, owner_id)
);

CREATE INDEX run_events_run_seq_idx ON run_events (run_id, seq);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  object_key text NOT NULL,
  original_name text NOT NULL,
  detected_mime text,
  byte_size bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_upload', 'processing', 'ready', 'failed', 'deleted')),
  sha256 text,
  extracted_chars int,
  page_count int,
  error_code text,
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  FOREIGN KEY (conversation_id, owner_id) REFERENCES conversations (id, owner_id)
);

CREATE INDEX files_owner_conversation_status_idx
  ON files (owner_id, conversation_id, status);

CREATE TABLE message_files (
  message_id uuid NOT NULL,
  file_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  PRIMARY KEY (message_id, file_id),
  FOREIGN KEY (message_id, owner_id) REFERENCES messages (id, owner_id),
  FOREIGN KEY (file_id, owner_id) REFERENCES files (id, owner_id)
);

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  file_id uuid NOT NULL,
  ordinal int NOT NULL,
  text text NOT NULL,
  page int,
  section text,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, ordinal),
  FOREIGN KEY (file_id, owner_id) REFERENCES files (id, owner_id)
);

CREATE INDEX document_chunks_search_idx ON document_chunks USING GIN (search_vector);

CREATE TABLE tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  run_id uuid NOT NULL,
  ordinal int NOT NULL,
  provider_call_id text NOT NULL,
  name text NOT NULL,
  arguments jsonb NOT NULL,
  args_hash text NOT NULL,
  integration_id uuid,
  status text NOT NULL CHECK (status IN ('proposed', 'waiting_approval', 'executing', 'succeeded', 'failed', 'rejected', 'unknown', 'cancelled')),
  operation_key text,
  safe_result jsonb,
  provider_reference text,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (run_id, ordinal),
  UNIQUE (run_id, provider_call_id),
  FOREIGN KEY (run_id, owner_id) REFERENCES runs (id, owner_id),
  FOREIGN KEY (integration_id, owner_id) REFERENCES integrations (id, owner_id)
);

CREATE UNIQUE INDEX tool_calls_operation_key_idx
  ON tool_calls (operation_key)
  WHERE operation_key IS NOT NULL;

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  run_id uuid NOT NULL,
  tool_call_id uuid NOT NULL UNIQUE,
  args_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (run_id, owner_id) REFERENCES runs (id, owner_id),
  FOREIGN KEY (tool_call_id, owner_id) REFERENCES tool_calls (id, owner_id)
);

CREATE TABLE run_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  run_id uuid NOT NULL,
  citation_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('web', 'file', 'mail', 'calendar')),
  title text NOT NULL,
  url text,
  file_id uuid,
  page int,
  excerpt text,
  retrieved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, citation_id),
  FOREIGN KEY (run_id, owner_id) REFERENCES runs (id, owner_id),
  FOREIGN KEY (file_id, owner_id) REFERENCES files (id, owner_id)
);

CREATE TABLE oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles (id),
  state_hash text NOT NULL UNIQUE,
  verifier_ciphertext bytea NOT NULL,
  verifier_nonce bytea NOT NULL,
  verifier_tag bytea NOT NULL,
  encryption_key_version text NOT NULL,
  integration_capability text NOT NULL CHECK (integration_capability IN ('gmail', 'calendar')),
  return_target text NOT NULL CHECK (return_target IN ('web', 'native')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles (id),
  route text NOT NULL,
  key uuid NOT NULL,
  request_hash text NOT NULL,
  response_status int,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, route, key)
);

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles (id),
  topic text NOT NULL,
  payload jsonb NOT NULL,
  dispatched_at timestamptz,
  retry_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  owner_id uuid NOT NULL REFERENCES profiles (id),
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL,
  PRIMARY KEY (owner_id, bucket, window_start)
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE encrypted_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs FORCE ROW LEVEL SECURITY;
ALTER TABLE run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_events FORCE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;
ALTER TABLE message_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_files FORCE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE run_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;

CREATE POLICY profiles_owner ON profiles
  USING (id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY integrations_owner ON integrations
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY credentials_owner ON encrypted_credentials
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY conversations_owner ON conversations
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid AND deleted_at IS NULL)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY messages_owner ON messages
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY runs_owner ON runs
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY run_events_owner ON run_events
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY files_owner ON files
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid AND deleted_at IS NULL)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY message_files_owner ON message_files
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY chunks_owner ON document_chunks
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY tool_calls_owner ON tool_calls
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY approvals_owner ON approvals
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY sources_owner ON run_sources
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY oauth_owner ON oauth_states
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY idempotency_owner ON idempotency_records
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY outbox_owner ON outbox
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

CREATE POLICY rate_limits_owner ON rate_limits
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  profiles, integrations, encrypted_credentials, conversations, messages, runs, run_events,
  files, message_files, document_chunks, tool_calls, approvals, run_sources, oauth_states,
  idempotency_records, outbox, rate_limits
TO app_api, app_worker;

-- Server-only worker role, restricted to application tables instead of BYPASSRLS.
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['profiles','integrations','encrypted_credentials','conversations','messages','runs','run_events','files','message_files','document_chunks','tool_calls','approvals','run_sources','oauth_states','idempotency_records','outbox','rate_limits'] LOOP
  EXECUTE format('CREATE POLICY worker_access ON %I TO app_worker USING(true) WITH CHECK(true)',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',tab); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',tab); END IF;
 END LOOP;
END $$;
