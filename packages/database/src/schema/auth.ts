import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Authorization model: users_logins.id → user_app_permissions.
 *
 * Grants are per user. There is no role table, no role_id and no role fallback:
 * what a person can do is exactly the set of rows carrying their user id, plus
 * the committee implication defined in src/middleware/rbac.ts. Roles were tried
 * (migration 0020) and removed again in 0025 — a role could only ever be
 * widened for everyone holding it, which is the opposite of what granting
 * access to one person requires.
 *
 * Also gone, and not to be reintroduced:
 *   roles / role_app_permissions       — the roles experiment, dropped in 0025.
 *   role_permissions / role_hierarchy  — declared here once but never deployed,
 *     so every query against them failed in production.
 *   user_app_access                    — deprecated, zero rows.
 */

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g., 'edit_employee', 'view_finance', 'approve_reset'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});


export const usersLogins = sqliteTable('users_logins', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id'),              // optional FK → employees.employee_id
  email: text('email').notNull().unique(),
  phone: text('phone'),
  username: text('username').unique(),          // for global profile management
  name: text('name'),                           // display name
  passwordHash: text('password_hash').notNull(), // pbkdf2$<iterations>$<salt>$<key>
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
  // The user this agent acts as; it inherits exactly that user's grants.
  userId: text('user_id').notNull().references(() => usersLogins.id),
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
 * user_app_permissions
 * The single source of authorization truth. Each row grants one feature of one
 * app to one user. Resolution is: user id → user_app_permissions. There is no
 * inheritance and no fallback chain — see src/middleware/rbac.ts.
 *
 * (user_id, app_name, feature) is unique, so saving a user's permissions is a
 * delete-then-insert of their whole set rather than a per-row merge.
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


