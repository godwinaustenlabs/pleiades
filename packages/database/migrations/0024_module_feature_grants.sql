-- Grants for the legal, tech, acquisition and ops features that their routes
-- serve but APP_FEATURES never declared.
--
-- Until now those four routers were gated only by requireAppAccess, so a role
-- holding nothing but `<app>/tasks` could read and write every record in the
-- module. That is the same hole migration 0023 closed for finance and that the
-- August audit closed for finance and HR; these are the remaining modules.
--
-- Undeclared features also meant getPerm() returned false for every
-- non-superadmin, so (exactly as with finance's `ledgers`) the affected tabs
-- were superadmin-only by accident -- most visibly acquisition's funnels view,
-- which the UI already gated on `funnels`.
--
-- Each grant is copied from a feature the role must already hold to reach the
-- app at all, so no role gains access it did not have in practice, and none
-- loses any.
--
-- Single-row / single-SELECT statements only: D1 rejects UNION ALL and
-- multi-row VALUES with "too many terms in compound SELECT" (see 0020).

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_legal_parties', rap.role_id, 'legal', 'parties',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'legal' AND rap.feature = 'agreements';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_legal_requests', rap.role_id, 'legal', 'requests',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'legal' AND rap.feature = 'agreements';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_legal_sops', rap.role_id, 'legal', 'sops',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'legal' AND rap.feature = 'agreements';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_tech_epics', rap.role_id, 'tech', 'epics',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'tech' AND rap.feature = 'projects';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_tech_stories', rap.role_id, 'tech', 'stories',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'tech' AND rap.feature = 'projects';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_tech_releases', rap.role_id, 'tech', 'releases',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'tech' AND rap.feature = 'projects';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_tech_environments', rap.role_id, 'tech', 'environments',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'tech' AND rap.feature = 'projects';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_acquisition_funnels', rap.role_id, 'acquisition', 'funnels',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'acquisition' AND rap.feature = 'campaigns';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_acquisition_outreach', rap.role_id, 'acquisition', 'outreach',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'acquisition' AND rap.feature = 'campaigns';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_acquisition_activity', rap.role_id, 'acquisition', 'activity',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'acquisition' AND rap.feature = 'campaigns';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_acquisition_deals', rap.role_id, 'acquisition', 'deals',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'acquisition' AND rap.feature = 'campaigns';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_' || rap.role_id || '_ops_reports', rap.role_id, 'ops', 'reports',
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM role_app_permissions rap
WHERE rap.app_name = 'ops' AND rap.feature = 'labs';
