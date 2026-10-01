-- `hr/appointments` becomes `admin/appointments`.
--
-- Creating a post and deciding who holds it is the act that confers access: since
-- 0047 a handover moves the post's grants, its mailbox and its committee seat to the
-- new holder in one edit. That is an access control, and it sat in HR next to
-- payroll — so the grant that let somebody run the payroll also let them hand
-- somebody else every permission a post carries.
--
-- Note what does NOT move. `admin/permissions` still decides what a post may REACH.
-- Splitting the two is the same reasoning as finance/agent vs finance/agent_config:
-- being able to appoint somebody to a job must not by itself be able to redefine
-- what the job opens, or `admin/appointments` becomes an escalation to anything by
-- way of creating a post, granting it everything, and appointing yourself to it.
--
-- Lossless by construction. Every holder of hr/appointments gets admin/appointments
-- at exactly the same three levels, and the old rows then go — a copy left behind
-- would be a grant naming a feature APP_FEATURES no longer declares, which getPerm()
-- can never satisfy, so it would sit in the table looking like access that does
-- nothing. The same INSERT ... SELECT pattern as 0023 and 0024.
--
-- Both grant tables, because access has two sources since 0047 and a migration that
-- remembered only one would silently narrow whoever held this through a post.

-- ── Access that belongs to a person ──────────────────────────────────────────
INSERT INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT
	'uap_' || lower(hex(randomblob(16))),
	p.user_id, 'admin', 'appointments',
	p.can_view, p.can_edit, p.can_delete,
	unixepoch(), unixepoch()
FROM user_app_permissions p
WHERE p.app_name = 'hr' AND p.feature = 'appointments'
  AND NOT EXISTS (
    SELECT 1 FROM user_app_permissions q
    WHERE q.user_id = p.user_id AND q.app_name = 'admin' AND q.feature = 'appointments'
  );

-- ── Access that belongs to a post ────────────────────────────────────────────
INSERT INTO appointment_app_permissions
	(id, appointment_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT
	'aap_' || lower(hex(randomblob(16))),
	p.appointment_id, 'admin', 'appointments',
	p.can_view, p.can_edit, p.can_delete,
	unixepoch(), unixepoch()
FROM appointment_app_permissions p
WHERE p.app_name = 'hr' AND p.feature = 'appointments'
  AND NOT EXISTS (
    SELECT 1 FROM appointment_app_permissions q
    WHERE q.appointment_id = p.appointment_id AND q.app_name = 'admin' AND q.feature = 'appointments'
  );

DELETE FROM user_app_permissions        WHERE app_name = 'hr' AND feature = 'appointments';
DELETE FROM appointment_app_permissions WHERE app_name = 'hr' AND feature = 'appointments';
