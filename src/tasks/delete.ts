import { inArray } from 'drizzle-orm';
import { schema } from '@pleiades/database';
import type { getDb } from '@pleiades/database';
import type { Env } from '../index';
import { chunk } from '../utils/batch';
import { keyFromUrl, removeObjects } from '../deletion/impact';

type Db = ReturnType<typeof getDb>;

/**
 * Deletes tasks the one way that works, and returns how many went.
 *
 * Logged time outlives the task: it was worked, and it is somebody's record, so it
 * is released to general work (`task_id → null`), which also keeps the foreign key
 * from refusing the delete. Attachments go with the task — left in place, their
 * foreign key refused the delete outright. One batch, so a task is never
 * half-removed; the files go after it commits, never before (see removeObjects).
 *
 * Used by `DELETE /tasks/:id` and by a repeating series clearing the occurrences
 * it has not reached yet.
 */
export async function deleteTasks(env: Env, db: Db, ids: string[]): Promise<number> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 0;

  const r2Keys: string[] = [];
  const writes: unknown[] = [];
  // 20 ids per statement keeps every IN list well under D1's bound-parameter limit.
  for (const part of chunk(unique, 20)) {
    const attachments = await db.query.taskAttachments.findMany({
      where: inArray(schema.taskAttachments.taskId, part),
      columns: { r2Key: true },
    });
    for (const a of attachments) {
      const k = keyFromUrl(a.r2Key);
      if (k) r2Keys.push(k);
    }
    writes.push(
      db.update(schema.timeEntries).set({ taskId: null }).where(inArray(schema.timeEntries.taskId, part)),
      db.delete(schema.taskAssignments).where(inArray(schema.taskAssignments.taskId, part)),
      db.delete(schema.taskAttachments).where(inArray(schema.taskAttachments.taskId, part)),
      db.delete(schema.universalTasks).where(inArray(schema.universalTasks.id, part)),
    );
  }
  // `batch` is typed as a non-empty tuple; the early return above is the guarantee.
  await db.batch(writes as unknown as [never, ...never[]]);
  await removeObjects(env, r2Keys);
  return unique.length;
}
