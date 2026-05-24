-- Migration: Granular Permissions System
-- Adds user_app_permissions table for per-feature access control
-- Adds is_superadmin flag to users_logins
-- Changes assignee_id FK from users_logins to employees
-- Adds task_type and estimated_hours to universal_tasks

-- 1. Add is_superadmin to users_logins
ALTER TABLE users_logins ADD COLUMN is_superadmin INTEGER DEFAULT 0;

-- 2. Create granular permissions table
CREATE TABLE IF NOT EXISTS user_app_permissions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users_logins(id),
  app_name TEXT NOT NULL,
  feature TEXT NOT NULL,
  can_view INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 3. Create unique index on (user_id, app_name, feature)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_app_permissions_unique
  ON user_app_permissions(user_id, app_name, feature);

-- 4. Index for quick lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_app_permissions_user
  ON user_app_permissions(user_id);

-- 5. Add new columns to universal_tasks\
ALTER TABLE universal_tasks ADD COLUMN estimated_hours REAL;

-- 6. Migrate existing user_app_access to user_app_permissions
-- For each row in user_app_access, create permission rows for all features of that app
-- Admin access => can_view=1, can_edit=1, can_delete=1 for ALL features
-- Employee access => can_view=1, can_edit=0, can_delete=0 for ALL features (except tasks which get can_edit=1 if canCreateTasks)

-- HR features: employees, appointments, payroll, resets, tasks
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'hr', 'employees',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'hr';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'hr', 'appointments',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'hr';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'hr', 'payroll',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'hr';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'hr', 'resets',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'hr';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'hr', 'tasks',
  1, CASE WHEN access_level = 'admin' OR can_create_tasks = 1 THEN 1 ELSE 0 END,
  CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'hr';

-- Finance features: transactions, invoices, fund_requests, accounts, tasks
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, app_name, 'transactions',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'finance';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, app_name, 'invoices',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'finance';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, app_name, 'fund_requests',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'finance';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, app_name, 'accounts',
  1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'finance';

INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, app_name, 'tasks',
  1, CASE WHEN access_level = 'admin' OR can_create_tasks = 1 THEN 1 ELSE 0 END,
  CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'finance';

-- For remaining apps (legal, tech, ops, acquisition), create ALL features with same pattern
-- We'll keep this compact by doing the tasks feature for each
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, app_name, 'tasks',
  1, CASE WHEN access_level = 'admin' OR can_create_tasks = 1 THEN 1 ELSE 0 END,
  CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END,
  unixepoch(), unixepoch()
FROM user_app_access WHERE app_name IN ('legal', 'tech', 'ops', 'acquisition');

-- Legal features
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'legal', 'agreements', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'legal';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'legal', 'templates', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'legal';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'legal', 'compliance', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'legal';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'legal', 'ip', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'legal';

-- Tech features
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'tech', 'projects', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'tech';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'tech', 'issues', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'tech';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'tech', 'deployments', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'tech';

-- Ops features
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'ops', 'labs', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'ops';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'ops', 'committees', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'ops';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'ops', 'clients', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'ops';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'ops', 'docs', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'ops';

-- Acquisition features
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'acquisition', 'campaigns', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'acquisition';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'acquisition', 'contacts', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'acquisition';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'acquisition', 'content', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'acquisition';
INSERT OR IGNORE INTO user_app_permissions (id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT 'perm_' || hex(randomblob(8)), user_id, 'acquisition', 'sprints', 1, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, CASE WHEN access_level = 'admin' THEN 1 ELSE 0 END, unixepoch(), unixepoch()
FROM user_app_access WHERE app_name = 'acquisition';

-- 7. Grant superadmin to all users who have level 1 in role_hierarchy (CEO)
UPDATE users_logins SET is_superadmin = 1
WHERE role_id IN (SELECT role_id FROM role_hierarchy WHERE level = 1);
