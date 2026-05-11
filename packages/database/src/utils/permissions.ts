import { eq } from 'drizzle-orm';
import { schema } from '@ganova/database';

type Db = ReturnType<typeof import('@ganova/database').getDb>;

/**
 * getUserPermissions
 *
 * Returns the full set of permission names granted to the given user's role.
 * Used by app-level routes for granular access checks.
 *
 * Usage:
 *   const perms = await getUserPermissions(db, user.roleId);
 *   if (!perms.includes('approve_fund_request')) return forbidden(c);
 */
export async function getUserPermissions(db: Db, roleId: string): Promise<string[]> {
  const rows = await db.query.rolePermissions.findMany({
    where: eq(schema.rolePermissions.roleId, roleId),
    with: { permission: true },
  });
  // @ts-ignore — permission is always present via with:
  return rows.map((r) => r.permission?.name).filter(Boolean) as string[];
}

/**
 * hasPermission
 *
 * Convenience check: does this role have the named permission?
 */
export async function hasPermission(
  db: Db,
  roleId: string,
  permissionName: string,
): Promise<boolean> {
  const perms = await getUserPermissions(db, roleId);
  return perms.includes(permissionName);
}

/**
 * getHierarchyLevel
 *
 * Returns the numeric hierarchy level for a role, or null if unset.
 * 1 = CEO (highest), higher numbers = lower authority.
 */
export async function getHierarchyLevel(db: Db, roleId: string): Promise<number | null> {
  const record = await db.query.roleHierarchy.findFirst({
    where: eq(schema.roleHierarchy.roleId, roleId),
  });
  return record?.level ?? null;
}

/**
 * canActorManageTarget
 *
 * Returns true if `actorRoleId` has strictly higher authority than `targetRoleId`.
 * HR Managers (level 2) can manage Employees (level 4) but not other HR Managers or CEO.
 * CEO (level 1) can manage everyone.
 */
export async function canActorManageTarget(
  db: Db,
  actorRoleId: string,
  targetRoleId: string,
): Promise<boolean> {
  const [actorLevel, targetLevel] = await Promise.all([
    getHierarchyLevel(db, actorRoleId),
    getHierarchyLevel(db, targetRoleId),
  ]);
  if (actorLevel === null || targetLevel === null) return false;
  return actorLevel < targetLevel; // strictly lower number = higher authority
}

/**
 * getAllowedModules
 *
 * Returns the list of app modules the role may access (from role_hierarchy table).
 */
export async function getAllowedModules(db: Db, roleId: string): Promise<string[]> {
  const record = await db.query.roleHierarchy.findFirst({
    where: eq(schema.roleHierarchy.roleId, roleId),
  });
  if (!record) return [];
  try {
    return JSON.parse(record.allowedModules || '[]');
  } catch {
    return [];
  }
}

/**
 * getProvisionableRoleIds
 *
 * Returns the list of role IDs that this role is allowed to provision accounts for.
 * HR Managers can only create Employee accounts (not other HR Managers or CEO).
 */
export async function getProvisionableRoleIds(db: Db, roleId: string): Promise<string[]> {
  const record = await db.query.roleHierarchy.findFirst({
    where: eq(schema.roleHierarchy.roleId, roleId),
  });
  if (!record) return [];
  try {
    return JSON.parse(record.canProvisionRoleIds || '[]');
  } catch {
    return [];
  }
}
