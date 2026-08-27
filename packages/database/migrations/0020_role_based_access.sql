-- Roles-only RBAC consolidation.
--
-- Before this migration all authorization hung off per-user rows in
-- user_app_permissions; the `roles` table held a single row ("Employee") and
-- carried no grants. This introduces role_app_permissions and derives four
-- roles from the four distinct permission sets that actually existed in
-- production, copying each role's grants verbatim from a representative user
-- so that no user's effective access changes.
--
-- The legacy tables (user_app_permissions, user_app_access) are intentionally
-- LEFT IN PLACE by this migration so it can be rolled back. They are dropped in
-- a follow-up migration once the roles path has been verified in production.

CREATE TABLE IF NOT EXISTS role_app_permissions (
	id TEXT PRIMARY KEY,
	role_id TEXT NOT NULL REFERENCES roles(id),
	app_name TEXT NOT NULL,
	feature TEXT NOT NULL,
	can_view INTEGER DEFAULT 0,
	can_edit INTEGER DEFAULT 0,
	can_delete INTEGER DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS role_app_permissions_role_app_feature_unique
	ON role_app_permissions (role_id, app_name, feature);

-- ── Roles ────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO roles (id, name, created_at) VALUES ('role_ceo', 'CEO', unixepoch());
INSERT OR IGNORE INTO roles (id, name, created_at) VALUES ('role_tech_lead', 'Tech Lead', unixepoch());
INSERT OR IGNORE INTO roles (id, name, created_at) VALUES ('role_marketing_lead', 'Marketing Lead', unixepoch());
INSERT OR IGNORE INTO roles (id, name, created_at) VALUES ('role_crm_member', 'CRM Member', unixepoch());

-- ── Grants, copied verbatim from each role's representative user ─────────────
INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_ceo_' || p.app_name || '_' || p.feature, 'role_ceo',
	p.app_name, p.feature, p.can_view, p.can_edit, p.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions p WHERE p.user_id = 'usr_8aaa3ffda339709375b69abc402cbbc6';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_tl_' || p.app_name || '_' || p.feature, 'role_tech_lead',
	p.app_name, p.feature, p.can_view, p.can_edit, p.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions p WHERE p.user_id = 'usr_a9aa50f88a5ed0978c86929e0defdb37';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_ml_' || p.app_name || '_' || p.feature, 'role_marketing_lead',
	p.app_name, p.feature, p.can_view, p.can_edit, p.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions p WHERE p.user_id = 'usr_b8914b44844d451750858e10b77948a5';

INSERT OR IGNORE INTO role_app_permissions
	(id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'rap_crm_' || p.app_name || '_' || p.feature, 'role_crm_member',
	p.app_name, p.feature, p.can_view, p.can_edit, p.can_delete, unixepoch(), unixepoch()
FROM user_app_permissions p WHERE p.user_id = 'usr_295ff4841364a3bdbbdfbc63e7e92172';

-- ── Role assignment ──────────────────────────────────────────────────────────
UPDATE users_logins SET role_id = 'role_ceo'
	WHERE id = 'usr_8aaa3ffda339709375b69abc402cbbc6';
UPDATE users_logins SET role_id = 'role_tech_lead'
	WHERE id = 'usr_a9aa50f88a5ed0978c86929e0defdb37';
UPDATE users_logins SET role_id = 'role_marketing_lead'
	WHERE id = 'usr_b8914b44844d451750858e10b77948a5';
UPDATE users_logins SET role_id = 'role_crm_member' WHERE id IN (
	'usr_904235df3d1cc495316b820566336db5', -- a.amir
	'usr_9f3864857c1f3d2290a1e9f79b1e0268', -- a.zahid
	'usr_aacb3535e6eac04f963f3c86cdf9d8b7', -- h.rauf
	'usr_7a3ba6ab1bd0f7bfa8525814f0dcbecc', -- m.ahmed
	'usr_295ff4841364a3bdbbdfbc63e7e92172', -- m.asif
	'usr_d2a63ff1cb53c2ef422a8d5371a93632'  -- s.zia
);

-- ── Newly-explicit modules ───────────────────────────────────────────────────
-- Written as one INSERT per row on purpose: D1 rejects the UNION ALL / multi-row
-- VALUES forms with "too many terms in compound SELECT".
--
-- `admin` replaces the previous (incorrect) gating of /api/admin on the `hr`
-- module. CEO is the only user who holds `hr` today, so effective access to the
-- admin surface is unchanged — it is simply now gated on the right thing.

INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_admin_roles', 'role_ceo', 'admin', 'roles', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_admin_permissions', 'role_ceo', 'admin', 'permissions', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_admin_users', 'role_ceo', 'admin', 'users', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_admin_api_keys', 'role_ceo', 'admin', 'api_keys', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_admin_audit_logs', 'role_ceo', 'admin', 'audit_logs', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_admin_resets', 'role_ceo', 'admin', 'resets', 1, 1, 1, unixepoch(), unixepoch());

-- `core` (employees, labs, clients, committees, docs) was previously reachable by
-- ANY authenticated user for read AND write. Read access is preserved for every
-- role because the UI depends on it; write access is narrowed to CEO. This is a
-- deliberate tightening of an unauthenticated-write hole, not a preservation.
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_core_employees', 'role_ceo', 'core', 'employees', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_core_labs', 'role_ceo', 'core', 'labs', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_core_clients', 'role_ceo', 'core', 'clients', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_core_committees', 'role_ceo', 'core', 'committees', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ceo_core_docs', 'role_ceo', 'core', 'docs', 1, 1, 1, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_tl_core_employees', 'role_tech_lead', 'core', 'employees', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_tl_core_labs', 'role_tech_lead', 'core', 'labs', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_tl_core_clients', 'role_tech_lead', 'core', 'clients', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_tl_core_committees', 'role_tech_lead', 'core', 'committees', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_tl_core_docs', 'role_tech_lead', 'core', 'docs', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ml_core_employees', 'role_marketing_lead', 'core', 'employees', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ml_core_labs', 'role_marketing_lead', 'core', 'labs', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ml_core_clients', 'role_marketing_lead', 'core', 'clients', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ml_core_committees', 'role_marketing_lead', 'core', 'committees', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_ml_core_docs', 'role_marketing_lead', 'core', 'docs', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_crm_core_employees', 'role_crm_member', 'core', 'employees', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_crm_core_labs', 'role_crm_member', 'core', 'labs', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_crm_core_clients', 'role_crm_member', 'core', 'clients', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_crm_core_committees', 'role_crm_member', 'core', 'committees', 1, 0, 0, unixepoch(), unixepoch());
INSERT OR IGNORE INTO role_app_permissions (id, role_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at) VALUES ('rap_crm_core_docs', 'role_crm_member', 'core', 'docs', 1, 0, 0, unixepoch(), unixepoch());
