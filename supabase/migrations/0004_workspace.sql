CREATE TABLE projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES profiles(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), memory text NOT NULL DEFAULT '' CHECK(length(memory)<=24000),
 version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id)
);
ALTER TABLE conversations ADD COLUMN project_id uuid;
ALTER TABLE conversations ADD COLUMN context_note text NOT NULL DEFAULT '' CHECK(length(context_note)<=24000);
ALTER TABLE conversations ADD COLUMN context_through_seq bigint NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN research_mode boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN budget_usd numeric(18,9) CHECK(budget_usd>0 AND budget_usd<=100);
ALTER TABLE conversations ADD CONSTRAINT conversation_project_owner FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id);
CREATE TABLE project_files (
 owner_id uuid NOT NULL, project_id uuid NOT NULL, file_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,file_id),
 FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(file_id,owner_id) REFERENCES files(id,owner_id) ON DELETE CASCADE
);
CREATE TABLE documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES profiles(id), project_id uuid,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), content text NOT NULL DEFAULT '' CHECK(length(content)<=200000),
 version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id), FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id)
);
CREATE TABLE document_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,document_id uuid NOT NULL,version int NOT NULL,
 title text NOT NULL,content text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(document_id,version),
 FOREIGN KEY(document_id,owner_id) REFERENCES documents(id,owner_id) ON DELETE CASCADE
);
CREATE TABLE schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES profiles(id),project_id uuid,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),prompt text NOT NULL CHECK(length(prompt) BETWEEN 1 AND 16000),
 model_id text NOT NULL,enabled_tools text[] NOT NULL DEFAULT '{}',
 timezone text NOT NULL,local_time text NOT NULL CHECK(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 weekday int CHECK(weekday BETWEEN 0 AND 6),budget_usd numeric(18,9) NOT NULL CHECK(budget_usd>0 AND budget_usd<=100),
 paused boolean NOT NULL DEFAULT false,next_at timestamptz NOT NULL,last_error text,
 version int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,owner_id),FOREIGN KEY(project_id,owner_id) REFERENCES projects(id,owner_id),
 CHECK(enabled_tools <@ ARRAY['web','files','gmail','calendar']::text[])
);
CREATE INDEX schedules_due ON schedules(next_at) WHERE NOT paused;
CREATE TABLE schedule_occurrences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,schedule_id uuid NOT NULL,due_at timestamptz NOT NULL,
 conversation_id uuid,run_id uuid,status text NOT NULL DEFAULT 'pending',error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(schedule_id,due_at),
 FOREIGN KEY(schedule_id,owner_id) REFERENCES schedules(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(conversation_id,owner_id) REFERENCES conversations(id,owner_id) ON DELETE CASCADE,
 FOREIGN KEY(run_id,owner_id) REFERENCES runs(id,owner_id) ON DELETE CASCADE
);
CREATE TABLE notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES profiles(id),
 run_id uuid, title text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,title),FOREIGN KEY(run_id,owner_id) REFERENCES runs(id,owner_id) ON DELETE CASCADE
);
ALTER TABLE runs ADD COLUMN estimated_committed_usd numeric(18,9) NOT NULL DEFAULT 0;
CREATE INDEX messages_content_search ON messages USING gin(to_tsvector('simple',content));
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['projects','project_files','documents','document_revisions','schedules','schedule_occurrences','notices'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY owner_access ON %I TO app_api USING(owner_id=NULLIF(current_setting(''app.owner_id'',true),'''')::uuid) WITH CHECK(owner_id=NULLIF(current_setting(''app.owner_id'',true),'''')::uuid)',tab);
  EXECUTE format('CREATE POLICY worker_access ON %I TO app_worker USING(true) WITH CHECK(true)',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO app_api,app_worker',tab);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON %I FROM anon',tab); END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated',tab); END IF;
 END LOOP;
END $$;
