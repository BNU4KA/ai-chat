ALTER TABLE profiles
  ADD COLUMN key_priority text NOT NULL DEFAULT 'personal'
  CHECK (key_priority IN ('personal', 'server'));
