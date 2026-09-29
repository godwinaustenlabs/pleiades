import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Authorization model. Two sources, unioned, resolved in src/middleware/rbac.ts:
 *
 *   users_logins.id          → user_app_permissions            (this table)
 *   users_logins.employee_id → appointments (active)
 *                            → appointment_app_permissions     (schema/hr.ts)
 *
 * A login is per PERSON — `employee_id` is unique across non-null values since
 * migration 0047 — and what that person can reach is their own rows here plus
 * the rows of every active appointment they hold, plus the committee implication
 * in rbac.ts. The flags are OR-ed per (app, feature); there is no ordering on
 * appointments and therefore no "highest" one to take instead.
 *
 * Which of the two a grant belongs in is a real decision, not a toss-up:
 *
 *   appointment_app_permissions — access that belongs to the JOB. Replacing a
 *     project manager is then one edit to `appointments.employee_id`, and both
 *     people's access changes with it. This is where access should normally go.
 *   user_app_permissions — access that belongs to the PERSON regardless of post,
 *     and the only option for a login with no employee record at all (an agent's
 *     actor, a contractor). Editing it affects exactly one person.
 *
 * Roles were tried (migration 0020) and removed again in 0025 — a role could
 * only ever be widened for everyone holding it. An appointment is not a role
 * revived: a role is held by many people at once, an appointment by one, so
 * widening one cannot widen anybody else's access.
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
  /**
   * The person this login belongs to — a soft FK → employees.employee_id, and
   * UNIQUE across non-null values since migration 0047.
   *
   * It is now load-bearing rather than decorative: every appointment-derived
   * grant, and every appointment mailbox, is reached through it. Null is still
   * legitimate (a login with no employee record), and such a login simply holds
   * no appointment grants.
   *
   * Always read it from the database, never from the JWT. The token carries a
   * copy made when it was signed, which a token minted before somebody was
   * linked to an employee — or relinked to a different one — would still be
   * presenting a week later.
   */
  employeeId: text('employee_id'),
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
  /**
   * Where password-reset mail is sent. Deliberately NOT `email` above.
   *
   * `email` is the login identifier and, once the apex MX moves to Cloudflare,
   * also a mailbox inside Pleiades — so sending a reset there would mean telling
   * a locked-out person to read a mailbox they cannot log in to reach. This must
   * be an address off the company domain; src/routes/auth.ts refuses to send a
   * reset when it is unset rather than falling back and mailing the void.
   */
  recoveryEmail: text('recovery_email'),
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
 *
 * Access that belongs to a PERSON rather than to a post — one row per (user,
 * app, feature). Half of the resolution in src/middleware/rbac.ts; the other
 * half is `appointment_app_permissions`, and the two are unioned rather than
 * ordered, so nothing here can be overridden or shadowed by an appointment.
 *
 * Prefer the appointment table for anything that goes with a job title. What
 * belongs here is access tied to the individual, and it is the only option for a
 * login with no employee record, which holds no appointments by construction.
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


