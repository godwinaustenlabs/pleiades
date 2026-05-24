import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., 'CEO', 'HR_Manager', 'Finance_Manager', 'Employee'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., 'edit_employee', 'view_finance', 'approve_reset'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const rolePermissions = sqliteTable('role_permissions', {
  roleId: text('role_id').notNull().references(() => roles.id),
  permissionId: text('permission_id').notNull().references(() => permissions.id),
});

export const usersLogins = sqliteTable('users_logins', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id'),              // optional FK → employees.employee_id
  email: text('email').notNull().unique(),
  phone: text('phone'),
  username: text('username').unique(),          // for global profile management
  name: text('name'),                           // display name
  passwordHash: text('password_hash').notNull(), // SHA-256 hex
  roleId: text('role_id').notNull().references(() => roles.id),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  isSuperadmin: integer('is_superadmin', { mode: 'boolean' }).default(false), // ONLY set via direct DB access, never via API
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  // ── Security / audit columns ─────────────────────────────────────────
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  failedAttempts: integer('failed_attempts').default(0).notNull(),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),           // null = not locked
  createdByUserId: text('created_by_user_id'),  // FK to usersLogins.id (HR Mgr who provisioned)
  passwordUpdatedAt: integer('password_updated_at', { mode: 'timestamp' }),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  keyHash: text('key_hash').notNull().unique(),
  ownerName: text('owner_name').notNull(), // e.g., 'Tech_Agent'
  roleId: text('role_id').notNull().references(() => roles.id),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),               // user or api_key id
  action: text('action').notNull(),      // 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'RESET'
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  details: text('details'),              // JSON string of changes
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

// ── HIERARCHICAL ACCOUNT MANAGEMENT ──────────────────────────────────────────

/**
 * role_hierarchy
 * Numeric rank per role — drives the RBAC engine instead of a hardcoded string map.
 *   level 1 → CEO         (sees everything, approves any reset, unlimited provision)
 *   level 2 → HR_Manager  (provisions employees under them, approves their resets)
 *   level 3 → Dept_Head   (Finance_Manager, Legal_Officer, Tech_Lead, Marketing_Lead)
 *   level 4 → Employee    (read-own only; can request — not approve — resets)
 *
 * canProvisionRoleIds  → JSON array of role IDs this role may create accounts for
 * allowedModules       → JSON array of app modules ('hr', 'finance', 'legal', 'tech', 'acquisition', 'ops', 'mcp_server')
 */
export const roleHierarchy = sqliteTable('role_hierarchy', {
  roleId: text('role_id').primaryKey().references(() => roles.id),
  level: integer('level').notNull(),
  canProvisionRoleIds: text('can_provision_role_ids').default('[]'),  // JSON
  allowedModules: text('allowed_modules').notNull().default('[]'),     // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * user_ownership
 * Maps every usersLogins record to the HR Manager (or CEO) who provisioned it.
 * Any password reset, deactivation, or role change for `userId` must be
 * initiated or approved by `ownerUserId` (or any user with level < ownerUserId.level).
 *
 * The CEO (level 1) can reassign ownership — tracked via assignedByUserId.
 */
export const userOwnership = sqliteTable('user_ownership', {
  userId: text('user_id').primaryKey().references(() => usersLogins.id),
  ownerUserId: text('owner_user_id').notNull().references(() => usersLogins.id),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull(),
  assignedByUserId: text('assigned_by_user_id'),  // records CEO-level override
});

/**
 * password_reset_tokens
 * Implements the 3-step delegated reset flow:
 *   Step 1 — POST /auth/request-reset        → status = 'pending'
 *   Step 2 — POST /admin/pending-resets/:id/approve  → status = 'approved'  (HR Mgr / CEO only)
 *   Step 3 — POST /auth/complete-reset        → status = 'used'
 *
 * Token is generated as a cryptographically random string; only its SHA-256 hash is stored.
 * Expires 24 h after requestedAt. Rejected tokens are marked 'rejected' (auditable).
 */
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => usersLogins.id),
  tokenHash: text('token_hash').notNull(),        // SHA-256 of the plaintext one-time token
  requestedAt: integer('requested_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(), // requestedAt + 86400 s
  approvedByUserId: text('approved_by_user_id'),  // HR Manager or CEO who approved
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  // 'pending' | 'approved' | 'used' | 'expired' | 'rejected'
  status: text('status').notNull().default('pending'),
});

/**
 * user_app_access (DEPRECATED — kept for backward compat during migration)
 * Maps a user to a specific app with an access level.
 */
export const userAppAccess = sqliteTable('user_app_access', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => usersLogins.id),
  appName: text('app_name').notNull(),
  accessLevel: text('access_level').notNull(),
  canCreateTasks: integer('can_create_tasks', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * user_app_permissions
 * Granular per-feature permissions for each app.
 * Each row grants a specific feature within an app to a user.
 * A user must have at least one row with can_view=1 for an app to be able to login to that app.
 * Features are app-specific (e.g., HR has 'employees', 'appointments', 'payroll', 'resets', 'tasks').
 */
export const userAppPermissions = sqliteTable('user_app_permissions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => usersLogins.id),
  appName: text('app_name').notNull(),
  feature: text('feature').notNull(),
  canView: integer('can_view', { mode: 'boolean' }).default(false),
  canEdit: integer('can_edit', { mode: 'boolean' }).default(false),
  canDelete: integer('can_delete', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const calendarFeeds = sqliteTable('calendar_feeds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => usersLogins.id),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});


