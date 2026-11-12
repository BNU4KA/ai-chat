ALTER TABLE run_sources ADD COLUMN document_id uuid;
ALTER TABLE run_sources ADD CONSTRAINT run_sources_document_owner
 FOREIGN KEY(document_id,owner_id) REFERENCES documents(id,owner_id);
CREATE INDEX run_sources_document_idx ON run_sources(document_id) WHERE document_id IS NOT NULL;
