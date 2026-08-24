-- Per-user granular permissions, replacing roles outright.
--
-- 0020 moved authorization from per-user rows onto four derived roles. Roles
-- turned out to be the wrong unit: two people doing the same job rarely need
-- exactly the same access, and a role can only be widened for everyone holding
-- it. This restores per-user grants and removes roles from the model entirely
-- -- there is no role table, no role_id, and no role fallback left.
--
-- The seed below is lossless with respect to effective access. 0020 derived
-- each role by copying one representative user's grants verbatim from a cluster
-- of users whose permission sets were identical, so expanding a user's role
-- back onto that user reproduces exactly the grants they hold today. Every
-- account keeps precisely the access it had before this migration; what changes
-- is that the grants are now theirs to edit individually.

-- D1 runs with foreign keys ENFORCED, and users_logins is referenced by
-- user_ownership, password_reset_tokens, calendar_feeds, universal_tasks and
-- others. Rebuilding it means dropping it, which trips every one of those
-- constraints mid-migration even though the table is recreated moments later
-- under the same name.
--
-- Deferring moves the check to COMMIT, by which point users_logins exists again
-- and every reference resolves. This is SQLite's documented recipe for a table
-- rebuild and is what D1 supports in place of toggling foreign_keys off (that
-- pragma is a no-op inside a transaction, which is where migrations run).
PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS user_app_permissions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users_logins(id),
	app_name TEXT NOT NULL,
	feature TEXT NOT NULL,
	can_view INTEGER DEFAULT 0,
	can_edit INTEGER DEFAULT 0,
	can_delete INTEGER DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- The uniqueness the editor relies on: one row per (user, app, feature), so a
-- save is a delete-then-insert of that user's set rather than a merge.
CREATE UNIQUE INDEX IF NOT EXISTS user_app_permissions_user_app_feature_unique
	ON user_app_permissions (user_id, app_name, feature);

CREATE INDEX IF NOT EXISTS user_app_permissions_user_idx
	ON user_app_permissions (user_id);

-- Expand every user's role grants onto the user. Superadmins are included for
-- completeness even though they bypass grant checks entirely.
INSERT OR IGNORE INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'uap_' || u.id || '_' || rap.app_name || '_' || rap.feature,
	u.id, rap.app_name, rap.feature,
	rap.can_view, rap.can_edit, rap.can_delete, unixepoch(), unixepoch()
FROM users_logins u
JOIN role_app_permissions rap ON rap.role_id = u.role_id;

-- `admin/roles` was a feature for administering roles. With roles gone it names
-- nothing, and a grant APP_FEATURES does not declare can never be satisfied --
-- it would sit in the table looking like access while doing nothing.
DELETE FROM user_app_permissions WHERE app_name = 'admin' AND feature = 'roles';

-- api_keys pointed an agent at a role. Agents now act as a specific user and
-- inherit that user's grants, which is what SECURITY.md already required of
-- agent tools ("agent tools inherit the calling user's permissions") and what
-- the x-agent-actor header does. The table is empty in production, so this is a
-- clean redefinition rather than a data migration.
DROP TABLE IF EXISTS api_keys;
CREATE TABLE api_keys (
	id TEXT PRIMARY KEY,
	key_hash TEXT NOT NULL UNIQUE,
	owner_name TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users_logins(id),
	is_active INTEGER DEFAULT 1,
	created_at INTEGER NOT NULL
);

-- users_logins.role_id cannot be dropped in place: SQLite refuses
-- ALTER TABLE ... DROP COLUMN on a column named by a foreign key
-- ("unknown column role_id in foreign key definition"), and the column carries
-- FOREIGN KEY (role_id) REFERENCES roles(id). So the table is rebuilt without
-- the column and without that constraint, by the standard SQLite recipe.
--
-- Column order and types below are copied from the live DDL. Both unique
-- indexes are recreated afterwards -- losing users_logins_email_unique would
-- let a second account share an email and quietly break login lookups.
CREATE TABLE users_logins_rebuild (
	id text PRIMARY KEY NOT NULL,
	employee_id text,
	email text NOT NULL,
	password_hash text NOT NULL,
	is_active integer DEFAULT true,
	created_at integer NOT NULL,
	last_login_at integer,
	failed_attempts integer DEFAULT 0 NOT NULL,
	locked_until integer,
	created_by_user_id text,
	password_updated_at integer,
	name text,
	username text,
	is_superadmin INTEGER DEFAULT 0,
	phone TEXT
);

INSERT INTO users_logins_rebuild
	(id, employee_id, email, password_hash, is_active, created_at, last_login_at,
	 failed_attempts, locked_until, created_by_user_id, password_updated_at,
	 name, username, is_superadmin, phone)
SELECT id, employee_id, email, password_hash, is_active, created_at, last_login_at,
	failed_attempts, locked_until, created_by_user_id, password_updated_at,
	name, username, is_superadmin, phone
FROM users_logins;

DROP TABLE users_logins;
ALTER TABLE users_logins_rebuild RENAME TO users_logins;

CREATE UNIQUE INDEX IF NOT EXISTS users_logins_email_unique ON users_logins (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_logins_username_unique ON users_logins (username);

DROP TABLE IF EXISTS role_app_permissions;
DROP TABLE IF EXISTS roles;

-- Re-enable enforcement before COMMIT.
--
-- Deferring alone is not enough: dropping users_logins increments SQLite's
-- deferred-constraint counter once per orphaned child row, and recreating the
-- table by RENAME does not decrement it, so COMMIT fails even though
-- PRAGMA foreign_key_check reports nothing wrong. Turning deferral back off
-- here runs the check immediately -- at a point where every reference resolves
-- again -- which clears the counter and lets the transaction commit.
PRAGMA defer_foreign_keys = false;
