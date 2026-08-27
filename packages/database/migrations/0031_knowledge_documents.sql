-- Documents indexed into the accountant's knowledge base.
--
-- Vectorize holds the passages; this holds what a person needs to see: which
-- files are indexed, when, by whom, and whether the last attempt worked. Without
-- it the knowledge base is opaque — you cannot tell an empty index from one that
-- silently failed to ingest a scanned PDF.
CREATE TABLE IF NOT EXISTS knowledge_documents (
	id TEXT PRIMARY KEY,
	r2_key TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	namespace TEXT NOT NULL DEFAULT 'compliance',
	chunk_count INTEGER NOT NULL DEFAULT 0,
	characters INTEGER NOT NULL DEFAULT 0,
	-- pending | indexed | failed
	status TEXT NOT NULL DEFAULT 'pending',
	error TEXT,
	ingested_by TEXT,
	ingested_at INTEGER,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx
	ON knowledge_documents (status, created_at);
