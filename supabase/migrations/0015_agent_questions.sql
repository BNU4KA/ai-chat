-- Agent questions with answer options (ADR-002): a run can pause in waiting_input until the user answers
-- or skips, or until the question expires after 12 hours.
ALTER TABLE runs DROP CONSTRAINT runs_status_check;
ALTER TABLE runs ADD CONSTRAINT runs_status_check CHECK (status IN
  ('queued', 'running', 'waiting_approval', 'waiting_input', 'completed', 'cancelled', 'failed'));
DROP INDEX runs_one_active_idx;
CREATE UNIQUE INDEX runs_one_active_idx ON runs (conversation_id)
  WHERE status IN ('queued', 'running', 'waiting_approval', 'waiting_input');

ALTER TABLE tool_calls DROP CONSTRAINT tool_calls_status_check;
ALTER TABLE tool_calls ADD CONSTRAINT tool_calls_status_check CHECK (status IN
  ('proposed', 'waiting_approval', 'waiting_input', 'executing', 'succeeded', 'failed', 'rejected', 'unknown', 'cancelled'));

CREATE TABLE agent_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  tool_call_id uuid NOT NULL,
  questions jsonb NOT NULL,
  answers jsonb NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  FOREIGN KEY (run_id, owner_id) REFERENCES runs (id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (tool_call_id, owner_id) REFERENCES tool_calls (id, owner_id) ON DELETE CASCADE
);
CREATE INDEX agent_questions_pending_idx ON agent_questions (status, expires_at) WHERE status = 'pending';
CREATE INDEX agent_questions_run_idx ON agent_questions (run_id);

ALTER TABLE agent_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_questions FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON agent_questions TO app_api
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY worker_access ON agent_questions TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_questions TO app_api, app_worker;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON agent_questions FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON agent_questions FROM authenticated; END IF;
END $$;
