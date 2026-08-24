-- Scope company_documents by department so each module can have its own docs
-- tab off one table, and grant the new `finance/docs` feature.
--
-- Existing rows are all HR SOPs/policies, so they are backfilled to 'hr' and the
-- HR routes now filter on it — HR sees exactly what it saw before.
--
-- NOTE: written as single-row statements. D1 rejects UNION ALL / multi-row
-- VALUES with "too many terms in compound SELECT" (see migration 0020).

ALTER TABLE company_documents ADD COLUMN department TEXT NOT NULL DEFAULT 'hr';

UPDATE company_documents SET department = 'hr' WHERE department IS NULL OR department = '';

CREATE INDEX IF NOT EXISTS company_documents_department_idx
	ON company_documents (department);

-- Grant finance/docs to every role that already administers finance, at the same
-- level it holds finance/transactions. No role gains finance access it lacked.
INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_finance_docs', rap.role_id, 'finance', 'docs',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'finance' AND rap.feature = 'transactions';
