ALTER TABLE files ADD COLUMN processing_token uuid;
ALTER TABLE files ADD COLUMN processing_until timestamptz;
ALTER TABLE oauth_states ADD COLUMN integration_version int NOT NULL DEFAULT 1;
ALTER TABLE run_sources ADD COLUMN section text;
CREATE TABLE credential_revisions (
 owner_id uuid PRIMARY KEY REFERENCES profiles(id), revision int NOT NULL DEFAULT 0
);
ALTER TABLE credential_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY revision_owner ON credential_revisions TO app_api USING(owner_id=NULLIF(current_setting('app.owner_id',true),'')::uuid) WITH CHECK(owner_id=NULLIF(current_setting('app.owner_id',true),'')::uuid);
CREATE POLICY revision_worker ON credential_revisions TO app_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON credential_revisions TO app_api,app_worker;
INSERT INTO credential_revisions(owner_id,revision) SELECT owner_id,credential_version FROM encrypted_credentials WHERE provider='openrouter';
CREATE TABLE integration_revocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES profiles(id),
 ciphertext bytea NOT NULL,nonce bytea NOT NULL,auth_tag bytea NOT NULL,encryption_key_version text NOT NULL,
 credential_version int NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), deadline timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
ALTER TABLE integration_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_revocations FORCE ROW LEVEL SECURITY;
CREATE POLICY revocation_worker ON integration_revocations TO app_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON integration_revocations TO app_worker;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON credential_revisions,integration_revocations FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON credential_revisions,integration_revocations FROM authenticated; END IF;
END $$;
ALTER TABLE tool_calls ADD COLUMN preview jsonb NOT NULL DEFAULT '{}'::jsonb;
