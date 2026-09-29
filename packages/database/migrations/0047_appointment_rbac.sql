-- One login per person; access defined per appointment.
--
-- Logins used to be per APPOINTMENT: `appointments.account_id` named a
-- users_logins row created for that one posting, and grants hung off that row.
-- One person holding two appointments therefore held two logins, two workspaces
-- and two sets of mail, and had to sign out of one to read the other. That is
-- the whole problem this migration removes.
--
-- What replaces it keeps the part that was right. Defining access per
-- appointment is genuinely better than defining it per person: replacing a
-- project manager should be one edit to the appointment, not a tour of the
-- permission matrix for two people. So the appointment keeps the grants and the
-- PERSON keeps the login:
--
--   users_logins.employee_id  -> exactly one login per employee (unique below)
--   appointment_app_permissions -> what an appointment can reach
--   effective grants           = the caller's own rows
--                              U every ACTIVE appointment held by their employee
--                              U the committee rule in src/middleware/rbac.ts
--
-- Union, not "the highest appointment". There is no ordering on appointments to
-- take a maximum over, and the case that motivated this — somebody who is both
-- CMO and a project manager — needs both sets at once, which is what a union is.
--
-- `mailboxes.appointment_id` is the other half. An appointment can own an
-- address (cto@), so whoever holds the appointment reads it in their own
-- workspace alongside their personal mail, and handing the appointment over
-- hands the mailbox over with it.

PRAGMA defer_foreign_keys = true;

-- ── What an appointment can reach ────────────────────────────────────────────
--
-- Deliberately the same shape as user_app_permissions, down to the column names:
-- the two are unioned per (app_name, feature) by OR-ing the three flags, and a
-- resolver that has to translate between two shapes is a resolver that will one
-- day translate one of them wrongly.
CREATE TABLE IF NOT EXISTS appointment_app_permissions (
	id TEXT PRIMARY KEY,
	appointment_id TEXT NOT NULL REFERENCES appointments(appointment_id),
	app_name TEXT NOT NULL,
	feature TEXT NOT NULL,
	can_view INTEGER DEFAULT 0,
	can_edit INTEGER DEFAULT 0,
	can_delete INTEGER DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- One row per (appointment, app, feature), so saving an appointment's access is
-- a delete-then-insert of the whole set rather than a per-row merge.
CREATE UNIQUE INDEX IF NOT EXISTS appointment_app_permissions_unique
	ON appointment_app_permissions (appointment_id, app_name, feature);
CREATE INDEX IF NOT EXISTS idx_appointment_app_permissions_appt
	ON appointment_app_permissions (appointment_id);

-- ── Move the grants from each appointment's login onto the appointment ───────
--
-- MOVE, not copy. Copying would leave two sources for the same access, and the
-- one nobody edits is the one that keeps working — so unticking a box on the
-- appointment would appear to do nothing. The insert runs before the delete and
-- both are scoped to accounts an appointment actually names, so a login with no
-- appointment (an agent's actor, say) keeps its own rows untouched.
INSERT INTO appointment_app_permissions
	(id, appointment_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT
	'aap_' || lower(hex(randomblob(16))),
	a.appointment_id,
	p.app_name,
	p.feature,
	MAX(p.can_view),
	MAX(p.can_edit),
	MAX(p.can_delete),
	unixepoch(),
	unixepoch()
FROM appointments a
JOIN user_app_permissions p ON p.user_id = a.account_id
WHERE a.account_id IS NOT NULL
GROUP BY a.appointment_id, p.app_name, p.feature;

DELETE FROM user_app_permissions
WHERE user_id IN (SELECT account_id FROM appointments WHERE account_id IS NOT NULL);

-- ── One login per person ─────────────────────────────────────────────────────
--
-- Every login already carried the employee it belongs to; nothing stopped a
-- second one naming the same employee, which is exactly how two logins for one
-- person came about. A partial index, because `employee_id` is legitimately NULL
-- for a login that belongs to no employee record and NULLs are not distinct
-- enough for a plain UNIQUE to allow more than one of them.
CREATE UNIQUE INDEX IF NOT EXISTS users_logins_employee_unique
	ON users_logins (employee_id) WHERE employee_id IS NOT NULL;

-- ── The appointment no longer names a login ──────────────────────────────────
--
-- Leaving the column would leave the old model half-expressed, and a column that
-- three handlers used to read is exactly the kind of leftover this repo has been
-- bitten by. Nothing references it, so there is no rebuild to do.
ALTER TABLE appointments DROP COLUMN account_id;

-- ── Mail that belongs to a post rather than a person or a department ─────────
--
-- cto@ is neither: it is not one individual's private mail, and granting
-- `tech/email` to reach it would hand it to everyone who works in Tech. It
-- belongs to the appointment, and the person holding the appointment today is
-- the person who should read it today.
ALTER TABLE mailboxes ADD COLUMN appointment_id TEXT REFERENCES appointments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_appointment ON mailboxes (appointment_id);

PRAGMA defer_foreign_keys = false;
