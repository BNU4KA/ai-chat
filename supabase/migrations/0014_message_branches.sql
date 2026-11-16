-- Message branches for edited user messages (ADR-001).
-- Each branch is a linear list of messages. A child branch forks from its parent at the seq of the
-- edited user message (fork_seq). The visible thread of a leaf branch is computed by visible_message_ids.
-- Edits of the same turn share turn_key, which groups the variants shown with the switcher.
CREATE TABLE conversation_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  parent_branch_id uuid NULL,
  fork_seq bigint NULL,
  turn_key uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  FOREIGN KEY (conversation_id, owner_id) REFERENCES conversations (id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_branch_id, owner_id) REFERENCES conversation_branches (id, owner_id) ON DELETE CASCADE,
  CHECK ((parent_branch_id IS NULL) = (fork_seq IS NULL))
);
CREATE INDEX conversation_branches_conversation_idx ON conversation_branches (conversation_id, created_at);
CREATE INDEX conversation_branches_parent_idx ON conversation_branches (parent_branch_id);

ALTER TABLE conversations ADD COLUMN active_leaf_branch_id uuid NULL;
ALTER TABLE messages ADD COLUMN branch_id uuid NULL;
ALTER TABLE messages ADD COLUMN turn_key uuid NULL;

-- Existing conversations: one root branch each, which becomes the active leaf.
INSERT INTO conversation_branches (owner_id, conversation_id)
  SELECT owner_id, id FROM conversations;
UPDATE conversations c SET active_leaf_branch_id = b.id
  FROM conversation_branches b
  WHERE b.conversation_id = c.id AND b.parent_branch_id IS NULL;
UPDATE messages m SET branch_id = c.active_leaf_branch_id
  FROM conversations c WHERE c.id = m.conversation_id;
ALTER TABLE messages ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE messages ADD FOREIGN KEY (branch_id, owner_id)
  REFERENCES conversation_branches (id, owner_id) ON DELETE CASCADE;
ALTER TABLE conversations ADD FOREIGN KEY (active_leaf_branch_id, owner_id)
  REFERENCES conversation_branches (id, owner_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX messages_branch_seq_idx ON messages (branch_id, seq);
CREATE INDEX messages_turn_idx ON messages (turn_key) WHERE turn_key IS NOT NULL;

-- A new conversation always starts with a root branch as its active leaf.
CREATE FUNCTION conversation_root_branch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created uuid;
BEGIN
  INSERT INTO conversation_branches (owner_id, conversation_id)
    VALUES (NEW.owner_id, NEW.id) RETURNING id INTO created;
  UPDATE conversations SET active_leaf_branch_id = created WHERE id = NEW.id;
  RETURN NULL;
END $$;
CREATE TRIGGER conversations_root_branch AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversation_root_branch();

-- Messages inserted without an explicit branch go to the conversation's active leaf.
CREATE FUNCTION message_default_branch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT active_leaf_branch_id INTO NEW.branch_id FROM conversations WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_default_branch BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION message_default_branch();

-- Messages visible on a leaf: messages of the leaf, plus messages of each ancestor before the
-- fork point of its child on the path. Legacy superseded rows stay hidden.
CREATE FUNCTION visible_message_ids(conv uuid, leaf uuid) RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain AS (
    SELECT b.id, b.parent_branch_id, b.fork_seq AS own_fork, NULL::bigint AS cutoff
      FROM conversation_branches b WHERE b.id = leaf AND b.conversation_id = conv
    UNION ALL
    SELECT p.id, p.parent_branch_id, p.fork_seq, c.own_fork
      FROM conversation_branches p JOIN chain c ON p.id = c.parent_branch_id
  )
  SELECT m.id FROM messages m JOIN chain ch ON ch.id = m.branch_id
   WHERE m.conversation_id = conv AND m.superseded_at IS NULL
     AND (ch.cutoff IS NULL OR m.seq < ch.cutoff)
$$;

CREATE FUNCTION active_message_ids(conv uuid) RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  SELECT visible_message_ids(c.id, c.active_leaf_branch_id)
    FROM conversations c WHERE c.id = conv
$$;

ALTER TABLE conversation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_branches FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON conversation_branches TO app_api
  USING (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid)
  WITH CHECK (owner_id = NULLIF(current_setting('app.owner_id', true), '')::uuid);
CREATE POLICY worker_access ON conversation_branches TO app_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_branches TO app_api, app_worker;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON conversation_branches FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON conversation_branches FROM authenticated; END IF;
END $$;
GRANT EXECUTE ON FUNCTION visible_message_ids(uuid, uuid), active_message_ids(uuid) TO app_api, app_worker;
