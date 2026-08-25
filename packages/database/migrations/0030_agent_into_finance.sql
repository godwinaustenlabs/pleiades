-- The accountant agent moves from an app of its own into Accounting.
--
-- It was briefly modelled as a standalone `agent` app with `config` and
-- `reports` features. That was wrong: the people who use it are the people who
-- already work the ledgers, and a separate app meant a separate tile, a
-- separate grant to remember, and a settings page living nowhere near the
-- accounts it governs.
--
-- It is now two features of `finance`:
--   finance/agent         drive the agent, decide its approvals
--   finance/agent_config  edit the compliance rates it quotes
--
-- Deliberately two, not one. Asking the accountant a question and changing what
-- the law says are different levels of trust; collapsing them would mean anyone
-- who can use it can also rewrite the rates behind every figure it produces.
--
-- Any grant anyone already held on the old app is carried across rather than
-- dropped, so nobody loses access in the move. In practice the app was only
-- ever reachable by superadmins (who bypass grants entirely), so this is
-- expected to move zero rows — it is written to be correct regardless.

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_finance_agent', uap.user_id, 'finance', 'agent',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'agent' AND uap.feature = 'reports';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_finance_agent_config', uap.user_id, 'finance', 'agent_config',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'agent' AND uap.feature = 'config';

-- The app no longer exists in APP_FEATURES, so any row naming it is a grant
-- that can never be satisfied — it would sit in the table looking like access
-- while doing nothing.
DELETE FROM user_app_permissions WHERE app_name = 'agent';
