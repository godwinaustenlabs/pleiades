import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, reseed, forgedToken } from './helpers';

/**
 * The workspace board and the workspace calendar must show the same tasks.
 *
 * They used to be computed separately: the calendar took assigned + committee +
 * post tasks, the board only assigned ones. A committee task assigned to somebody
 * else therefore sat on every member's calendar and on no board anywhere — and the
 * calendar had no delete, so it could not be removed from the UI at all.
 *
 * Fixture: emp_dual sits on cmt_test and holds ap_pm. emp_hold holds nothing.
 */

async function as(user: string, employeeId: string | null, superadmin = false) {
  return forgedToken({ id: user, employeeId, isSuperadmin: superadmin });
}

async function get(token: string, path: string) {
  const res = await SELF.fetch(`https://test.local${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: (await res.json()) as any };
}

const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id).sort();

beforeAll(resetDatabase);
beforeEach(async () => {
  await reseed();
  const s = (sql: string) => env.DB.prepare(sql);
  await env.DB.batch([
    // On the committee, assigned to someone else — the task that went missing.
    s(`INSERT INTO universal_tasks (task_id,title,status,department,committee_id,board_position,created_at,updated_at)
       VALUES ('t_cmt','Committee task','in_progress','Dashboard','cmt_test',0,0,0)`),
    s(`INSERT INTO task_assignments (assignment_id,task_id,employee_id,assigned_at) VALUES ('ta_cmt','t_cmt','emp_hold',0)`),
    // On a post emp_dual holds.
    s(`INSERT INTO universal_tasks (task_id,title,status,department,appointment_id,board_position,created_at,updated_at)
       VALUES ('t_post','Post task','todo','Tech','ap_pm',0,0,0)`),
    // Assigned to emp_dual directly.
    s(`INSERT INTO universal_tasks (task_id,title,status,department,board_position,created_at,updated_at)
       VALUES ('t_mine','Mine','todo','HR',0,0,0)`),
    s(`INSERT INTO task_assignments (assignment_id,task_id,employee_id,assigned_at) VALUES ('ta_mine','t_mine','emp_dual',0)`),
  ]);
});

describe('GET /api/tasks?scope=workspace', () => {
  it('shows assigned, post and committee tasks — including one assigned to someone else', async () => {
    const { status, body } = await get(await as('u_dual', 'emp_dual'), '/api/tasks?scope=workspace');
    expect(status).toBe(200);
    expect(ids(body.data)).toEqual(['t_cmt', 't_mine', 't_post']);
  });

  it('is exactly the set the workspace calendar shows', async () => {
    const token = await as('u_dual', 'emp_dual', true);
    const board = await get(token, '/api/tasks?scope=workspace');
    const calendar = await get(token, '/api/dashboard/me');
    expect(calendar.status).toBe(200);
    expect(ids(board.body.data)).toEqual(ids(calendar.body.data.tasks));
  });

  it('shows somebody only their own assignments when they hold no post or seat', async () => {
    const { body } = await get(await as('u_hold', 'emp_hold'), '/api/tasks?scope=workspace');
    expect(ids(body.data)).toEqual(['t_cmt']);
  });

  it('is empty for a login with no employee record', async () => {
    const { status, body } = await get(await as('u_tech', null), '/api/tasks?scope=workspace');
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('deletes a task that has an attachment, and the attachment with it', async () => {
    await env.DB.prepare(
      `INSERT INTO task_attachments (id,task_id,title,r2_key,created_at) VALUES ('tatt_1','t_cmt','brief.pdf','task-attachments/t_cmt/brief.pdf',0)`,
    ).run();
    const token = await as('u_ceo', null, true);
    const res = await SELF.fetch('https://test.local/api/tasks/t_cmt', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM universal_tasks WHERE task_id='t_cmt'`).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM task_attachments WHERE task_id='t_cmt'`).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM task_assignments WHERE task_id='t_cmt'`).first()).toBeNull();
  });
});
