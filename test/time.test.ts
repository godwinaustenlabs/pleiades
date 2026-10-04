import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, reseed, forgedToken } from './helpers';
import * as time from '../src/time/store';
import { localDate, hourProfile, localToUtc } from '../src/time/clock';
import { deleteEmployee } from '../src/deletion/impact';
import responsesSnapshot from './__snapshots__/responses.txt?raw';
import accountantTools from '../src/agents/accountant/tools.ts?raw';

/**
 * Time logging — the replacement for attendance. See docs/attendance-design.md.
 *
 * The cases that matter are the ones a read-only sweep cannot see: two tabs racing
 * a start, a session crossing midnight, two people in different zones, an edit that
 * must keep what the timer first recorded, and who may read whose time. Pay here is
 * per task and nobody owes hours, so the last block pins that no response grows a
 * "late" or a per-person ranking.
 */

const H = 3_600_000;
const D = 24 * H;

/**
 * Five people around one department:
 *   emp_a     staff, Karachi, in s_eng, reports to emp_mgr
 *   emp_b     staff, New York, in s_ops
 *   emp_head  heads s_eng
 *   emp_mgr   emp_a's reporting manager, in s_ops (so NOT emp_a's head)
 *   emp_hr    holds hr/attendance view + edit
 * plus u_viewer, who can see Tech tasks but has logged nothing.
 */
const PEOPLE = ['a', 'b', 'head', 'mgr', 'hr'] as const;
type Person = (typeof PEOPLE)[number] | 'viewer';

async function fixture() {
  const s = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b);
  await env.DB.batch([
    s(`INSERT INTO employees (employee_id,name,employment_status,created_at,updated_at,timezone) VALUES ('emp_head','Head','active',0,0,'Asia/Karachi')`),
    s(`INSERT INTO employees (employee_id,name,employment_status,created_at,updated_at,timezone) VALUES ('emp_mgr','Manager','active',0,0,'Asia/Karachi')`),
    s(`INSERT INTO employees (employee_id,name,employment_status,created_at,updated_at,timezone) VALUES ('emp_hr','HR','active',0,0,'Asia/Karachi')`),
    s(`INSERT INTO sectors (sector_id,sector_name,head_employee_id,created_at) VALUES ('s_eng','Engineering','emp_head',0)`),
    s(`INSERT INTO sectors (sector_id,sector_name,head_employee_id,created_at) VALUES ('s_ops','Operations',NULL,0)`),
    s(`INSERT INTO employees (employee_id,name,employment_status,created_at,updated_at,timezone,sector_id,reporting_manager_id) VALUES ('emp_a','Ayesha','active',0,0,'Asia/Karachi','s_eng','emp_mgr')`),
    s(`INSERT INTO employees (employee_id,name,employment_status,created_at,updated_at,timezone,sector_id) VALUES ('emp_b','Bilal','active',0,0,'America/New_York','s_ops')`),
    s(`UPDATE employees SET sector_id = 's_ops' WHERE employee_id = 'emp_mgr'`),
    ...PEOPLE.map((p) => s(
      `INSERT INTO users_logins (id,email,username,name,password_hash,employee_id,is_active,is_superadmin,created_at,failed_attempts)
       VALUES (?,?,?,?,'x',?,1,0,0,0)`, `u_${p}`, `u_${p}@test.local`, `u_${p}`, `u_${p}`, `emp_${p}`)),
    s(`INSERT INTO users_logins (id,email,username,name,password_hash,is_active,is_superadmin,created_at,failed_attempts)
       VALUES ('u_viewer','u_viewer@test.local','u_viewer','u_viewer','x',1,0,0,0)`),
    ...[...PEOPLE, 'viewer'].map((p) => s(
      `INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
       VALUES (?,?,'dashboard','overview',1,1,0,0,0)`, `uap_t_${p}`, `u_${p}`)),
    s(`INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
       VALUES ('uap_t_hr_att','u_hr','hr','attendance',1,1,0,0,0)`),
    s(`INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
       VALUES ('uap_t_viewer_tasks','u_viewer','tech','tasks',1,0,0,0,0)`),
    s(`INSERT INTO universal_tasks (task_id,title,status,department,creator_id,created_at,updated_at)
       VALUES ('t_site','Acme landing page','in_progress','Tech','u_mgr',0,0)`),
    s(`INSERT INTO universal_tasks (task_id,title,status,department,created_at,updated_at)
       VALUES ('t_other','Somebody else''s task','todo','Finance',0,0)`),
    s(`INSERT INTO task_assignments (assignment_id,task_id,employee_id,assigned_at) VALUES ('ta_1','t_site','emp_a',0)`),
    s(`INSERT INTO task_assignments (assignment_id,task_id,employee_id,assigned_at) VALUES ('ta_2','t_site','emp_b',0)`),
  ]);
}

async function call(who: Person, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const token = await forgedToken({ id: `u_${who}`, employeeId: who === 'viewer' ? null : `emp_${who}` });
  const res = await SELF.fetch(`https://test.local${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const entriesOf = async (employeeId: string) =>
  (await env.DB.prepare('SELECT * FROM time_entries WHERE employee_id = ? ORDER BY started_at').bind(employeeId).all<any>()).results;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await reseed();
  await fixture();
});

describe('play / pause', () => {
  it('runs start → pause → resume → switch → done, and the day equals the sum of its entries', async () => {
    const t0 = Date.UTC(2026, 8, 10, 5, 0); // 10:00 in Karachi
    await time.transition(env.DB, 'emp_a', 'start', { taskId: 't_site' }, t0);
    await time.transition(env.DB, 'emp_a', 'pause', {}, t0 + 2 * H);
    const resumed = await time.transition(env.DB, 'emp_a', 'resume', {}, t0 + 2.5 * H);
    // Resume returns to the task worked before the pause.
    expect(resumed.openEntry?.taskId).toBe('t_site');
    await time.transition(env.DB, 'emp_a', 'switch', { taskId: null }, t0 + 4 * H);
    const done = await time.transition(env.DB, 'emp_a', 'done', {}, t0 + 5 * H);

    expect(done.state).toBe('idle');
    const rows = await entriesOf('emp_a');
    expect(rows.map((r: any) => r.kind)).toEqual(['work', 'pause', 'work', 'work']);
    // No gaps, no overlaps: each interval starts where the last ended.
    for (let i = 1; i < rows.length; i++) expect(rows[i].started_at).toBe(rows[i - 1].ended_at);
    const day = await env.DB.prepare('SELECT * FROM work_days WHERE employee_id = ?').bind('emp_a').first<any>();
    expect(day.work_date).toBe('2026-09-10');
    expect(day.logged_ms).toBe(4.5 * H);
    expect(day.paused_ms).toBe(0.5 * H);
  });

  it('lets exactly one of two simultaneous starts through', async () => {
    const [x, y] = await Promise.all([
      call('a', 'POST', '/api/dashboard/time/start'),
      call('a', 'POST', '/api/dashboard/time/start'),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    // The refusal carries the current state, so the losing tab corrects itself.
    const loser = x.status === 409 ? x : y;
    expect(loser.json.data.state).toBe('working');
    const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE employee_id = ? AND ended_at IS NULL').bind('emp_a').first<any>();
    expect(open.n).toBe(1);
  });

  it('refuses actions that do not fit the state', async () => {
    expect((await call('a', 'POST', '/api/dashboard/time/pause')).status).toBe(409);
    await call('a', 'POST', '/api/dashboard/time/start');
    expect((await call('a', 'POST', '/api/dashboard/time/resume')).status).toBe(409);
    await call('a', 'POST', '/api/dashboard/time/pause');
    expect((await call('a', 'POST', '/api/dashboard/time/switch', { taskId: null })).status).toBe(409);
    expect((await call('a', 'POST', '/api/dashboard/time/done')).status).toBe(200);
  });

  it('only logs against tasks the person can see', async () => {
    const r = await call('a', 'POST', '/api/dashboard/time/start', { taskId: 't_other' });
    expect(r.status).toBe(403);
    expect(await entriesOf('emp_a')).toHaveLength(0);
    const tasks = await call('a', 'GET', '/api/dashboard/time/tasks');
    expect(tasks.json.data.map((t: any) => t.id)).toEqual(['t_site']);
  });

  it('answers null, not an error, for a login with no employee record', async () => {
    const r = await call('viewer', 'GET', '/api/dashboard/time/state');
    expect(r.status).toBe(200);
    expect(r.json.data).toBeNull();
  });
});

describe('dates and zones', () => {
  it('files a session that crosses midnight on the date it started', async () => {
    const start = localToUtc('2026-09-10', 22, 0, 'Asia/Karachi');
    await time.transition(env.DB, 'emp_a', 'start', {}, start);
    await time.transition(env.DB, 'emp_a', 'done', {}, start + 4 * H);
    const { results } = await env.DB.prepare('SELECT * FROM work_days WHERE employee_id = ?').bind('emp_a').all<any>();
    expect(results).toHaveLength(1);
    expect(results[0].work_date).toBe('2026-09-10');
    expect(results[0].logged_ms).toBe(4 * H);
  });

  it('gives two people in different zones different dates for the same instant', async () => {
    const instant = Date.UTC(2026, 8, 10, 22, 0); // 03:00 on the 11th in Karachi, 18:00 on the 10th in New York
    await time.transition(env.DB, 'emp_a', 'start', {}, instant);
    await time.transition(env.DB, 'emp_b', 'start', {}, instant);
    const dates = async (e: string) => (await env.DB.prepare('SELECT work_date, timezone FROM work_days WHERE employee_id = ?').bind(e).first<any>());
    expect(await dates('emp_a')).toEqual({ work_date: '2026-09-11', timezone: 'Asia/Karachi' });
    expect(await dates('emp_b')).toEqual({ work_date: '2026-09-10', timezone: 'America/New_York' });
  });

  it('does not re-date history when somebody changes timezone', async () => {
    const instant = Date.UTC(2026, 8, 10, 22, 0);
    await time.transition(env.DB, 'emp_a', 'start', {}, instant);
    await time.transition(env.DB, 'emp_a', 'done', {}, instant + H);
    await env.DB.prepare(`UPDATE employees SET timezone = 'America/New_York' WHERE employee_id = 'emp_a'`).run();
    const day = await env.DB.prepare('SELECT work_date, timezone FROM work_days WHERE employee_id = ?').bind('emp_a').first<any>();
    expect(day).toEqual({ work_date: '2026-09-11', timezone: 'Asia/Karachi' });
  });

  it('refuses an unknown timezone on the employee record', async () => {
    const token = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    const res = await SELF.fetch('https://test.local/api/core/employees/emp_a', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: 'Asia/Karachy' }),
    });
    expect(res.status).toBe(400);
  });

  it('computes an hour profile in local time and leaves duration-only entries out of it', () => {
    const tz = 'Asia/Karachi';
    const at = (h: number, m = 0) => localToUtc('2026-09-10', h, m, tz);
    const profile = hourProfile([
      { kind: 'work', startedAt: at(9, 30), endedAt: at(11, 0) },
      { kind: 'work', startedAt: at(12), endedAt: at(14), timeUnknown: true },
    ], tz, at(23));
    expect(profile[9].workMs).toBe(0.5 * H);
    expect(profile[10].workMs).toBe(H);
    expect(profile[12].workMs).toBe(0);
    expect(localDate(at(0, 30), tz)).toBe('2026-09-10');
  });
});

describe('adding and editing your own time', () => {
  it('counts a duration-only entry in the totals', async () => {
    const date = localDate(Date.now() - 2 * D, 'Asia/Karachi');
    const r = await call('a', 'POST', '/api/dashboard/time/entries', { date, minutes: 120, taskId: 't_site' });
    expect(r.status).toBe(201);
    expect(r.json.data.timeUnknown).toBe(true);
    expect(r.json.data.source).toBe('manual');
    const day = await call('a', 'GET', `/api/dashboard/time/days/${date}`);
    expect(day.json.data.day.loggedMs).toBe(2 * H);
    expect(day.json.data.hours.every((h: any) => h.workMs === 0)).toBe(true);
  });

  it('allows 13 days back and refuses 15', async () => {
    const now = Date.now();
    const ok = await call('a', 'POST', '/api/dashboard/time/entries', { startedAt: now - 13 * D, endedAt: now - 13 * D + H });
    expect(ok.status).toBe(201);
    const old = await call('a', 'POST', '/api/dashboard/time/entries', { startedAt: now - 15 * D, endedAt: now - 15 * D + H });
    expect(old.status).toBe(403);
  });

  it('refuses an entry that overlaps time already logged', async () => {
    const now = Date.now();
    await call('a', 'POST', '/api/dashboard/time/entries', { startedAt: now - 5 * H, endedAt: now - 3 * H });
    const r = await call('a', 'POST', '/api/dashboard/time/entries', { startedAt: now - 4 * H, endedAt: now - 2 * H });
    expect(r.status).toBe(400);
  });

  it('keeps what the timer recorded on the first edit, and does not overwrite it on the second', async () => {
    const t0 = Date.now() - 6 * H;
    await time.transition(env.DB, 'emp_a', 'start', {}, t0);
    await time.transition(env.DB, 'emp_a', 'done', {}, t0 + 2 * H);
    const [entry] = await entriesOf('emp_a');

    const first = await call('a', 'PATCH', `/api/dashboard/time/entries/${entry.time_entry_id}`, { endedAt: t0 + 3 * H, taskId: 't_site' });
    expect(first.status).toBe(200);
    expect(first.json.data.originalEndedAt).toBe(t0 + 2 * H);
    expect(first.json.data.originalTaskId).toBeNull();
    expect(first.json.data.editedAt).not.toBeNull();

    const second = await call('a', 'PATCH', `/api/dashboard/time/entries/${entry.time_entry_id}`, { endedAt: t0 + 4 * H, taskId: null });
    expect(second.json.data.originalEndedAt).toBe(t0 + 2 * H);
    expect(second.json.data.originalTaskId).toBeNull();
    expect(second.json.data.endedAt).toBe(t0 + 4 * H);
  });

  it('cannot touch somebody else\'s entry through self-service', async () => {
    const now = Date.now();
    const mine = await call('b', 'POST', '/api/dashboard/time/entries', { startedAt: now - 3 * H, endedAt: now - 2 * H });
    const r = await call('a', 'DELETE', `/api/dashboard/time/entries/${mine.json.data.id}`);
    expect(r.status).toBe(404);
  });

  it('offers missed days only to the person themselves, from their own task activity', async () => {
    const yesterday = Math.floor((Date.now() - D) / 1000);
    await env.DB.prepare(`INSERT INTO audit_logs (id,user_id,action,table_name,record_id,timestamp) VALUES ('log_x','u_a','UPDATE','universal_tasks','t_site',?)`).bind(yesterday).run();
    const mine = await call('a', 'GET', '/api/dashboard/time/missed');
    expect(mine.json.data).toHaveLength(1);
    expect(mine.json.data[0].tasks).toEqual([{ id: 't_site', title: 'Acme landing page' }]);
    expect((await call('b', 'GET', '/api/dashboard/time/missed')).json.data).toEqual([]);
  });
});

describe('forgotten timers', () => {
  it('closes a work timer at 16 hours and marks it, leaving fresh ones alone', async () => {
    const now = Date.now();
    await time.transition(env.DB, 'emp_a', 'start', {}, now - 17 * H);
    await time.transition(env.DB, 'emp_b', 'start', {}, now - H);
    expect(await time.sweepForgotten(env.DB, now)).toBe(1);
    const [a] = await entriesOf('emp_a');
    expect(a.ended_at - a.started_at).toBe(16 * H);
    expect(a.auto_closed).toBe(1);
    const [b] = await entriesOf('emp_b');
    expect(b.ended_at).toBeNull();
  });

  it('leaves auto-closed time out of a task\'s total', async () => {
    const now = Date.now();
    await time.transition(env.DB, 'emp_a', 'start', { taskId: 't_site' }, now - 20 * H);
    await time.sweepForgotten(env.DB, now);
    const t = await time.taskTime(env.DB, 't_site');
    expect(t.totalMs).toBe(0);
    expect(t.autoClosedMs).toBe(16 * H);
  });
});

describe('who sees whose time', () => {
  it('lets the department head and the reporting manager read, and nobody else without hr/attendance', async () => {
    expect((await call('head', 'GET', '/api/time/people/emp_a/days')).status).toBe(200);
    expect((await call('mgr', 'GET', '/api/time/people/emp_a/days')).status).toBe(200);
    expect((await call('hr', 'GET', '/api/time/people/emp_a/days')).status).toBe(200);
    expect((await call('b', 'GET', '/api/time/people/emp_a/days')).status).toBe(403);
    // emp_b is not in the head's department.
    expect((await call('head', 'GET', '/api/time/people/emp_b/days')).status).toBe(403);
  });

  it('moves a head\'s access when somebody changes department', async () => {
    await env.DB.prepare(`UPDATE employees SET sector_id = 's_eng' WHERE employee_id = 'emp_b'`).run();
    expect((await call('head', 'GET', '/api/time/people/emp_b/days')).status).toBe(200);
  });

  it('lets a head or HR change old time with a reason, but not a manager, and not on oneself', async () => {
    const old = { startedAt: Date.now() - 20 * D, endedAt: Date.now() - 20 * D + H, reason: 'Forgot to log the client visit' };
    expect((await call('mgr', 'POST', '/api/time/people/emp_a/entries', old)).status).toBe(403);
    expect((await call('head', 'POST', '/api/time/people/emp_a/entries', { ...old, reason: '' })).status).toBe(400);
    expect((await call('head', 'POST', '/api/time/people/emp_a/entries', old)).status).toBe(201);
    expect((await call('hr', 'POST', '/api/time/people/emp_hr/entries', old)).status).toBe(403);
  });

  it('shows a task\'s contributor split to contributors and its creator, and only the total to other viewers', async () => {
    const now = Date.now();
    await call('a', 'POST', '/api/dashboard/time/entries', { startedAt: now - 5 * H, endedAt: now - 2 * H, taskId: 't_site' });
    await call('b', 'POST', '/api/dashboard/time/entries', { startedAt: now - 5 * H, endedAt: now - 4 * H, taskId: 't_site' });

    const mine = await call('a', 'GET', '/api/time/tasks/t_site');
    expect(mine.json.data.totalMs).toBe(4 * H);
    const shares = mine.json.data.contributors.map((c: any) => c.share);
    expect(shares.reduce((s: number, x: number) => s + x, 0)).toBeCloseTo(1);
    expect(mine.json.data.contributors.map((c: any) => c.name)).toEqual(['Ayesha', 'Bilal']);

    expect((await call('mgr', 'GET', '/api/time/tasks/t_site')).json.data.contributors).toHaveLength(2);

    const viewer = await call('viewer', 'GET', '/api/time/tasks/t_site');
    expect(viewer.status).toBe(200);
    expect(viewer.json.data.totalMs).toBe(4 * H);
    expect(viewer.json.data.contributors).toBeNull();

    expect((await call('viewer', 'GET', '/api/time/tasks/t_other')).status).toBe(403);
  });

  it('keeps the organisation report and live count behind hr/attendance', async () => {
    expect((await call('head', 'GET', '/api/time/report')).status).toBe(403);
    expect((await call('hr', 'GET', '/api/time/report?group=task')).status).toBe(200);
    expect((await call('a', 'GET', '/api/time/now')).status).toBe(403);
  });
});

describe('what happens to time when things are deleted', () => {
  it('keeps a deleted task\'s time as general work', async () => {
    const now = Date.now();
    await call('a', 'POST', '/api/dashboard/time/entries', { startedAt: now - 3 * H, endedAt: now - 2 * H, taskId: 't_site' });
    const token = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    const res = await SELF.fetch('https://test.local/api/tasks/t_site', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const [e] = await entriesOf('emp_a');
    expect(e.task_id).toBeNull();
    expect(e.ended_at - e.started_at).toBe(H);
  });

  it('removes a deleted person\'s time with them', async () => {
    const now = Date.now();
    await time.transition(env.DB, 'emp_b', 'start', {}, now - H);
    await time.transition(env.DB, 'emp_b', 'done', {}, now);
    expect(await deleteEmployee(env as any, 'emp_b')).not.toBeNull();
    expect(await entriesOf('emp_b')).toHaveLength(0);
    const days = await env.DB.prepare(`SELECT COUNT(*) AS n FROM work_days WHERE employee_id = 'emp_b'`).first<any>();
    expect(days.n).toBe(0);
  });
});

describe('what this system never says', () => {
  it('has no late, absent or overtime anywhere in a time response', () => {
    const timeLines = responsesSnapshot
      .split('\n')
      .filter((l, i, all) => /\/time\b/.test(l) || /\/time\b/.test(all[i - 1] ?? ''));
    expect(timeLines.length).toBeGreaterThan(0);
    for (const l of timeLines) expect(l).not.toMatch(/\b(late|absent|overtime|rank|score)\b/i);
  });

  it('gives the accountant no way to read logged time', () => {
    expect(accountantTools).not.toMatch(/get_attendance|\/api\/time|\/dashboard\/time/);
  });
});
