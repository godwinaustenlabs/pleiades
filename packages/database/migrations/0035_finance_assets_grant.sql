-- `finance/assets` — the asset register.
--
-- A new feature is invisible until someone is granted it: resolveGrants answers
-- from user_app_permissions and nothing else, so without this migration the tab
-- would be superadmin-only by accident. That has happened before in this
-- codebase (finance/ledgers, acquisition/funnels), which is why every new
-- feature ships with its grant.
--
-- Copied from `finance/accounts`: the register is the physical side of the same
-- books, so anyone trusted with the chart of accounts is already trusted with
-- what the company owns. Nobody gains an app they could not already open, and
-- nobody loses anything.

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_finance_assets', uap.user_id, 'finance', 'assets',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'finance' AND uap.feature = 'accounts';
