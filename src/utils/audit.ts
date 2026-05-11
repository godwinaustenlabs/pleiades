import { getDb } from '@ganova/database';
import { schema } from '@ganova/database';
import { generateId } from './id';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'READ' | 'LOGIN' | 'RESET' | 'PROVISION' | 'DEPROVISION';

/**
 * Writes a record to the audit_logs table.
 * Call this after any CREATE, UPDATE, or DELETE operation.
 */
export async function logAudit(
  env: any,
  userId: string,
  action: AuditAction,
  tableName: string,
  recordId: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const db = getDb(env);
    await db.insert(schema.auditLogs).values({
      id: generateId('log'),
      userId,
      action,
      tableName,
      recordId,
      details: details ? JSON.stringify(details) : null,
      timestamp: new Date(),
    });
  } catch (err) {
    // Audit logging should never break the main operation
    console.error('[audit] Failed to write audit log:', err);
  }
}
