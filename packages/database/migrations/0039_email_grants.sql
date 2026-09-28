-- Grants for the mail features added in 0038_email.sql.
--
-- A new feature is invisible until somebody is granted it: resolveGrants answers
-- from user_app_permissions and nothing else, so without this migration every
-- Email tab would be superadmin-only by accident. That has happened three times
-- in this codebase already (finance/ledgers, acquisition/funnels, and
-- acquisition's `leads`, which is still broken), which is why every new feature
-- ships with its grant.
--
-- Two deliberate asymmetries:
--
--  1. `<app>/email` copies view/edit/delete verbatim from the app's anchor
--     feature, so whoever can already work in a department can also use its
--     mailbox. That IS a widening — an HR editor gains the ability to send mail
--     as hr@ — and it is the intended reading of "who can use app emails": the
--     population that runs a department is the population that answers its mail.
--     Narrowing an individual afterwards is one edit on the Access page, and a
--     single mailbox that must be narrower than its app is what mailbox_grants
--     is for.
--
--  2. `<app>/email_templates` copies can_view ONLY. Editing the template that
--     every automated message renders through reaches further than sending one
--     message does — a bad edit goes to everybody, repeatedly, and nobody
--     notices until a client reads it. Seeing templates is automatic; authoring
--     one is a deliberate grant.
--
-- No role's access changes, nobody gains an app they could not already open, and
-- nobody loses anything. Personal mailboxes are absent from all of this on
-- purpose: they are reached through owner_user_id in src/email/mailboxes.ts, not
-- through a grant, because access to somebody else's private mail must not be a
-- thing that can be granted.
--
-- One statement per feature: D1 rejects multi-row compound SELECTs with "too
-- many terms in compound SELECT" past a handful of UNION ALL terms (see the
-- header of 0020), so these cannot be collapsed.

-- Mailbox access, at the same level the caller already holds on the department.
INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_hr_email', uap.user_id, 'hr', 'email',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'hr' AND uap.feature = 'employees';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_finance_email', uap.user_id, 'finance', 'email',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'finance' AND uap.feature = 'accounts';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_legal_email', uap.user_id, 'legal', 'email',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'legal' AND uap.feature = 'agreements';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_tech_email', uap.user_id, 'tech', 'email',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'tech' AND uap.feature = 'projects';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_acquisition_email', uap.user_id, 'acquisition', 'email',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'acquisition' AND uap.feature = 'campaigns';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_ops_email', uap.user_id, 'ops', 'email',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'ops' AND uap.feature = 'labs';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_crm_email', uap.user_id, 'crm', 'email',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'crm' AND uap.feature = 'tickets';

-- Template visibility only. Edit is withheld on purpose; see the header.
INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_hr_email_templates', uap.user_id, 'hr', 'email_templates',
	uap.can_view, 0, 0, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'hr' AND uap.feature = 'employees';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_finance_email_templates', uap.user_id, 'finance', 'email_templates',
	uap.can_view, 0, 0, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'finance' AND uap.feature = 'accounts';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_legal_email_templates', uap.user_id, 'legal', 'email_templates',
	uap.can_view, 0, 0, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'legal' AND uap.feature = 'agreements';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_tech_email_templates', uap.user_id, 'tech', 'email_templates',
	uap.can_view, 0, 0, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'tech' AND uap.feature = 'projects';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_acquisition_email_templates', uap.user_id, 'acquisition', 'email_templates',
	uap.can_view, 0, 0, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'acquisition' AND uap.feature = 'campaigns';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_ops_email_templates', uap.user_id, 'ops', 'email_templates',
	uap.can_view, 0, 0, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'ops' AND uap.feature = 'labs';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_crm_email_templates', uap.user_id, 'crm', 'email_templates',
	uap.can_view, 0, 0, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'crm' AND uap.feature = 'tickets';

-- Creating and assigning mailboxes, and editing the system templates, go to
-- whoever already administers access. That is the same population by
-- definition: admin/permissions is the grant that hands out grants.

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_admin_mailboxes', uap.user_id, 'admin', 'mailboxes',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'admin' AND uap.feature = 'permissions';

INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || uap.user_id || '_admin_email_config', uap.user_id, 'admin', 'email_config',
	uap.can_view, uap.can_edit, uap.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions uap
WHERE uap.app_name = 'admin' AND uap.feature = 'permissions';
