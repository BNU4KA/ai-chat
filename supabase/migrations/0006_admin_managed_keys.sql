CREATE TABLE managed_openrouter_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  auth_tag bytea NOT NULL,
  encryption_key_version text NOT NULL,
  last_four text NOT NULL,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  validated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE managed_openrouter_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE managed_openrouter_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY managed_keys_worker ON managed_openrouter_keys
  TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON managed_openrouter_keys TO app_worker;

ALTER TABLE profiles ADD COLUMN email text;
ALTER TABLE profiles
  ADD COLUMN managed_openrouter_key_id uuid REFERENCES managed_openrouter_keys (id) ON DELETE SET NULL;
CREATE INDEX profiles_managed_openrouter_key_id ON profiles (managed_openrouter_key_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON managed_openrouter_keys FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON managed_openrouter_keys FROM authenticated;
  END IF;
END $$;
