ALTER TABLE files ADD COLUMN derived_from_file_id uuid REFERENCES files (id) ON DELETE SET NULL;

CREATE INDEX files_derived_from_idx ON files (derived_from_file_id) WHERE derived_from_file_id IS NOT NULL;
