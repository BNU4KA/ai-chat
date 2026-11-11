-- Preserve existing profile language values; automatic applies to new accounts only.
ALTER TABLE profiles ALTER COLUMN locale SET DEFAULT 'auto';
ALTER TABLE profiles ADD CONSTRAINT profiles_locale_supported CHECK (locale IN ('auto','en','ru'));
