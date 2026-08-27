-- Grants for the finance features that the UI already gated on but which were
-- never declared in APP_FEATURES: `ledgers`, `journals`, `trial_balance`.
--
-- Because they were undeclared, getPerm() returned false for every non-superadmin,
-- making those tabs superadmin-only by accident. The routes are now gated per
-- feature (previously the whole finance router was gated only on
-- requireAppAccess('finance'), so a user holding just finance/tasks could read
-- every ledger, account and invoice).
--
-- Each grant is copied from the role's existing finance/accounts row, so no role
-- gains access it did not already have in practice.
--
-- Single-row / single-SELECT statements only: D1 rejects UNION ALL and multi-row
-- VALUES with "too many terms in compound SELECT" (see 0020).

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_finance_ledgers', rap.role_id, 'finance', 'ledgers',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'finance' AND rap.feature = 'accounts';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_finance_journals', rap.role_id, 'finance', 'journals',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'finance' AND rap.feature = 'accounts';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_finance_trial_balance', rap.role_id, 'finance', 'trial_balance',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'finance' AND rap.feature = 'accounts';
