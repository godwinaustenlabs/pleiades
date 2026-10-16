import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { getDb } from '@pleiades/database';
import { resetDatabase, reseed, forgedToken } from './helpers';
import { createSeries, runDueSeries, materialize, type RecurrenceRow } from '../src/tasks/recurring';
import { parseRule, type Rule, type RuleInput } from '../src/tasks/recurrence';
import { deleteAppointment, deleteEmployee, appointmentImpact } from '../src/deletion/impact';
import { DAY_MS, HOUR_MS } from '../src/time/clock';

/**
 * Repeating tasks, end to end: the API that creates and manages a series, the
 * cron that turns occurrences into tasks, and everything downstream that must
 * see those tasks as ordinary ones.
 *
 * Fixture people: emp_dual (u_dual) sits on cmt_test and holds ap_pm; emp_hold
 * (u_hold) holds nothing. u_ceo may create tasks in every department, u_tech only
 * in Tech.
 */

const db = () => getDb(env as any);
const utc = (s: string) => Date.parse(`${s}Z`);

function rule(input: RuleInput): Rule {
  const r = parseRule(input);
  if ('error' in r) throw new Error(r.error);
  return r.rule;
}

async function api(user: string, method: string, path: string, body?: unknown, employeeId: string | null = null) {
  const token = await forgedToken({ id: user, employeeId });
  const res = await SELF.fetch(`https://test.local${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function occurrences(recurrenceId: string) {
  const { results } = await env.DB.prepare(
    `SELECT task_id, title, status, start_date, due_date, occurrence_at, department, committee_id
       FROM universal_tasks WHERE recurrence_id = ? ORDER BY occurrence_at`,
  ).bind(recurrenceId).all<any>();
  return results;
}

async function assigneesOf(taskId: string) {
  const { results } = await env.DB.prepare('SELECT employee_id FROM task_assignments WHERE task_id = ? ORDER BY employee_id').bind(taskId).all<any>();
  return results.map((r) => r.employee_id);
}

async function seriesRow(id: string): Promise<RecurrenceRow> {
  return (await db().query.taskRecurrences.findFirst({ where: (r, { eq }) => eq(r.id, id) }))!;
}

const today = () => new Date().toISOString().slice(0, 10);

beforeAll(resetDatabase);
beforeEach(reseed);

describe('creating a repeating task through POST /api/tasks', () => {
  it('creates the series and its first occurrences as ordinary, assigned tasks', async () => {
    const { status, body } = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Daily stand-up notes',
      department: 'Tech',
      priority: 'medium',
      assigneeIds: ['emp_dual'],
      committeeId: 'cmt_test',
      recurrence: { frequency: 'daily', timeOfDay: '00:00', startsOn: today(), timezone: 'UTC' },
    });
    expect(status).toBe(201);
    expect(body.data.recurrenceId).toMatch(/^trec_/);
    expect(body.data.summary).toBe('Every day at 00:00');

    // Today's (already due) and tomorrow's (inside the one-day lead).
    const occ = await occurrences(body.data.recurrenceId);
    expect(occ.map((o) => o.start_date)).toEqual([today(), new Date(Date.now() + DAY_MS).toISOString().slice(0, 10)]);
    for (const o of occ) {
      expect(o).toMatchObject({ title: 'Daily stand-up notes', status: 'todo', department: 'Tech', committee_id: 'cmt_test' });
      expect(o.due_date).toBe(o.start_date);
      expect(await assigneesOf(o.task_id)).toEqual(['emp_dual']);
    }
  });

  it('shows up on the assignee\'s workspace board, the department board and the calendar feed', async () => {
    const { body } = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Weekly report', department: 'Tech', assigneeIds: ['emp_dual'],
      recurrence: { frequency: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], timeOfDay: '00:00', startsOn: today(), timezone: 'UTC' },
    });
    const ids = (await occurrences(body.data.recurrenceId)).map((o) => o.task_id);
    expect(ids.length).toBeGreaterThan(0);

    const workspace = await api('u_dual', 'GET', '/api/tasks?scope=workspace', undefined, 'emp_dual');
    expect(workspace.body.data.map((t: any) => t.id)).toEqual(expect.arrayContaining(ids));
    const board = await api('u_ceo', 'GET', '/api/tasks?dept=Tech');
    expect(board.body.data.map((t: any) => t.id)).toEqual(expect.arrayContaining(ids));
    const me = await api('u_dual', 'GET', '/api/dashboard/me', undefined, 'emp_dual');
    expect(me.body.data.tasks.map((t: any) => t.id)).toEqual(expect.arrayContaining(ids));
    // And each says which series it belongs to.
    expect(board.body.data.find((t: any) => t.id === ids[0]).recurrenceId).toBe(body.data.recurrenceId);
  });

  it('refuses a bad rule and writes nothing', async () => {
    const before = await env.DB.prepare('SELECT count(*) n FROM task_recurrences').first<any>();
    for (const recurrence of [
      { frequency: 'fortnightly', startsOn: today() },
      { frequency: 'monthly', monthDay: 32, startsOn: today() },
      { frequency: 'weekly', weekdays: [], startsOn: today() },
      { frequency: 'daily' },
    ]) {
      const r = await api('u_ceo', 'POST', '/api/tasks', { title: 'x', department: 'Tech', recurrence });
      expect(r.status).toBe(400);
    }
    const after = await env.DB.prepare('SELECT count(*) n FROM task_recurrences').first<any>();
    expect(after.n).toBe(before.n);
    expect((await env.DB.prepare('SELECT count(*) n FROM universal_tasks WHERE recurrence_id IS NOT NULL').first<any>()).n).toBe(0);
  });

  it('is gated like any task: the department\'s tasks/edit', async () => {
    const r = await api('u_tech', 'POST', '/api/tasks', {
      title: 'Payroll check', department: 'HR', recurrence: { frequency: 'monthly', startsOn: today() },
    });
    expect(r.status).toBe(403);
  });

  it('does not let a client write the series link onto a task directly', async () => {
    const real = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Real', department: 'Tech', recurrence: { frequency: 'daily', timeOfDay: '00:00', startsOn: today(), timezone: 'UTC' },
    });
    const forged = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Forged', department: 'Tech', recurrenceId: real.body.data.recurrenceId, occurrenceAt: 1,
    });
    expect(forged.status).toBe(201);
    const row = await env.DB.prepare('SELECT recurrence_id, occurrence_at FROM universal_tasks WHERE task_id = ?').bind(forged.body.data.id).first<any>();
    expect(row).toEqual({ recurrence_id: null, occurrence_at: null });
  });

  it('skips assignees who are no longer active', async () => {
    await env.DB.prepare(`UPDATE employees SET employment_status = 'terminated' WHERE employee_id = 'emp_hold'`).run();
    const { body } = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Both of us', department: 'Tech', assigneeIds: ['emp_dual', 'emp_hold'],
      recurrence: { frequency: 'daily', timeOfDay: '00:00', startsOn: today(), timezone: 'UTC' },
    });
    const [first] = await occurrences(body.data.recurrenceId);
    expect(await assigneesOf(first.task_id)).toEqual(['emp_dual']);
  });
});

describe('the cron — creating occurrences as they come due', () => {
  const template = { title: 'Month end close', department: 'Finance', assigneeIds: ['emp_dual'] };

  it('the 31st lands on 31 Jan, 28 Feb, 31 Mar, 30 Apr as the months pass', async () => {
    const r = rule({ frequency: 'monthly', monthDay: 31, timeOfDay: '09:00', startsOn: '2027-01-01', timezone: 'UTC' });
    const { row } = await createSeries(db(), template, r, null, utc('2027-01-25T00:00'));
    expect((await occurrences(row.id)).map((o) => o.start_date)).toEqual(['2027-01-31']);

    await runDueSeries(env as any, utc('2027-02-22T00:00'));
    await runDueSeries(env as any, utc('2027-03-25T00:00'));
    await runDueSeries(env as any, utc('2027-04-24T00:00'));
    expect((await occurrences(row.id)).map((o) => o.start_date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('running twice, or twice at once, creates every occurrence exactly once', async () => {
    const r = rule({ frequency: 'weekly', weekdays: [1, 3, 5], timeOfDay: '08:00', startsOn: '2027-03-01', timezone: 'Asia/Karachi' });
    const { row } = await createSeries(db(), template, r, null, utc('2027-02-20T00:00'));
    const now = utc('2027-03-03T00:00');
    await runDueSeries(env as any, now);
    await runDueSeries(env as any, now);
    // Two writers racing on the same stale row.
    const stale = await seriesRow(row.id);
    await Promise.all([materialize(db(), stale, now + DAY_MS), materialize(db(), stale, now + DAY_MS)]);

    const occ = await occurrences(row.id);
    expect(new Set(occ.map((o) => o.occurrence_at)).size).toBe(occ.length);
    for (const o of occ) expect(await assigneesOf(o.task_id)).toEqual(['emp_dual']);
  });

  it('after an outage, creates only the latest missed occurrence, not a flood', async () => {
    const r = rule({ frequency: 'hourly', timeOfDay: '00:00', startsOn: '2027-01-01', timezone: 'UTC' });
    const { row } = await createSeries(db(), template, r, null, utc('2027-01-01T00:10'));
    const before = (await occurrences(row.id)).length;
    // Nothing ran for three days.
    await runDueSeries(env as any, utc('2027-01-04T05:30'));
    const after = await occurrences(row.id);
    expect(after.length - before).toBe(2); // 05:00 (latest missed) and 06:00 (lead)
    expect(after.slice(-2).map((o) => new Date(o.occurrence_at).toISOString())).toEqual(['2027-01-04T05:00:00.000Z', '2027-01-04T06:00:00.000Z']);
  });

  it('a deleted occurrence is not re-created', async () => {
    const r = rule({ frequency: 'daily', timeOfDay: '09:00', startsOn: '2027-05-01', timezone: 'UTC' });
    const { row } = await createSeries(db(), template, r, null, utc('2027-05-01T10:00'));
    const [first] = await occurrences(row.id);
    const del = await api('u_ceo', 'DELETE', `/api/tasks/${first.task_id}`);
    expect(del.status).toBe(200);
    await runDueSeries(env as any, utc('2027-05-01T10:00'));
    await runDueSeries(env as any, utc('2027-05-02T10:00'));
    expect((await occurrences(row.id)).map((o) => o.start_date)).not.toContain('2027-05-01');
  });

  it('stops at endsOn and then has nothing left to do', async () => {
    const r = rule({ frequency: 'daily', timeOfDay: '09:00', startsOn: '2027-06-01', endsOn: '2027-06-03', timezone: 'UTC' });
    const { row } = await createSeries(db(), template, r, null, utc('2027-06-01T10:00'));
    for (const d of ['02', '03', '04', '10']) await runDueSeries(env as any, utc(`2027-06-${d}T10:00`));
    expect((await occurrences(row.id)).map((o) => o.start_date)).toEqual(['2027-06-01', '2027-06-02', '2027-06-03']);
    expect((await seriesRow(row.id)).nextRunAt).toBeNull();
  });

  it('one broken series does not stop the others', async () => {
    const good = await createSeries(db(), template, rule({ frequency: 'daily', timeOfDay: '09:00', startsOn: '2027-07-01', timezone: 'UTC' }), null, utc('2027-06-20T00:00'));
    const bad = await createSeries(db(), template, rule({ frequency: 'daily', timeOfDay: '09:00', startsOn: '2027-07-01', timezone: 'UTC' }), null, utc('2027-06-20T00:00'));
    // Corrupt one row behind the API's back so it throws when the cron reads it.
    await env.DB.prepare(`UPDATE task_recurrences SET timezone = 'Not/AZone' WHERE recurrence_id = ?`).bind(bad.row.id).run();
    await runDueSeries(env as any, utc('2027-07-01T10:00'));
    expect((await occurrences(good.row.id)).length).toBeGreaterThan(0);
    expect(await occurrences(bad.row.id)).toEqual([]);
  });
});

describe('managing a series', () => {
  async function dailySeries() {
    const { body } = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Check the inbox', department: 'Tech', assigneeIds: ['emp_dual'],
      recurrence: { frequency: 'daily', timeOfDay: '00:00', startsOn: today(), timezone: 'UTC' },
    });
    return body.data.recurrenceId as string;
  }

  it('GET returns the rule in words and its people', async () => {
    const id = await dailySeries();
    const r = await api('u_ceo', 'GET', `/api/tasks/recurrences/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id, summary: 'Every day at 00:00', assigneeIds: ['emp_dual'], isActive: true });
  });

  it('an edit re-creates upcoming untouched occurrences and leaves past ones alone', async () => {
    const id = await dailySeries();
    const [past, future] = await occurrences(id);
    const r = await api('u_ceo', 'PATCH', `/api/tasks/recurrences/${id}`, { title: 'Check both inboxes' });
    expect(r.status).toBe(200);
    expect(r.body.data.replacedOccurrences).toBe(1);
    const occ = await occurrences(id);
    expect(occ.find((o) => o.task_id === past.task_id)?.title).toBe('Check the inbox');
    expect(occ.find((o) => o.occurrence_at === future.occurrence_at)?.title).toBe('Check both inboxes');
  });

  it('an edit never replaces an occurrence somebody has started', async () => {
    const id = await dailySeries();
    const [, future] = await occurrences(id);
    await api('u_ceo', 'PATCH', `/api/tasks/${future.task_id}`, { status: 'in_progress' });
    await api('u_ceo', 'PATCH', `/api/tasks/recurrences/${id}`, { title: 'Renamed' });
    const after = (await occurrences(id)).find((o) => o.occurrence_at === future.occurrence_at);
    expect(after).toMatchObject({ task_id: future.task_id, status: 'in_progress', title: 'Check the inbox' });
  });

  it('a rule change takes effect from the next occurrence', async () => {
    const id = await dailySeries();
    const r = await api('u_ceo', 'PATCH', `/api/tasks/recurrences/${id}`, {
      recurrence: { frequency: 'monthly', monthDay: 31, timeOfDay: '00:00', startsOn: today(), timezone: 'UTC' },
    });
    expect(r.status).toBe(200);
    expect(r.body.data.summary).toBe('Every month on the 31st (or the last day) at 00:00');
    const bad = await api('u_ceo', 'PATCH', `/api/tasks/recurrences/${id}`, { recurrence: { frequency: 'monthly', monthDay: 40, startsOn: today() } });
    expect(bad.status).toBe(400);
  });

  it('stopping removes upcoming untouched occurrences, keeps the rest, and creates no more', async () => {
    const id = await dailySeries();
    const [past] = await occurrences(id);
    const r = await api('u_ceo', 'POST', `/api/tasks/recurrences/${id}/stop`);
    expect(r.status).toBe(200);
    expect(r.body.data.removedOccurrences).toBe(1);
    expect((await occurrences(id)).map((o) => o.task_id)).toEqual([past.task_id]);
    await runDueSeries(env as any, Date.now() + 10 * DAY_MS);
    expect((await occurrences(id)).length).toBe(1);
    expect((await api('u_ceo', 'PATCH', `/api/tasks/recurrences/${id}`, { title: 'Again' })).status).toBe(400);
  });

  it('managing a series needs the department\'s tasks/edit', async () => {
    const { body } = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'HR review', department: 'HR', recurrence: { frequency: 'weekly', startsOn: today() },
    });
    const id = body.data.recurrenceId;
    expect((await api('u_tech', 'PATCH', `/api/tasks/recurrences/${id}`, { title: 'x' })).status).toBe(403);
    expect((await api('u_tech', 'POST', `/api/tasks/recurrences/${id}/stop`)).status).toBe(403);
    expect((await api('u_tech', 'GET', `/api/tasks/recurrences/${id}`)).status).toBe(403);
  });

  it('preview explains a rule without saving anything', async () => {
    const r = await api('u_tech', 'POST', '/api/tasks/recurrences/preview', {
      recurrence: { frequency: 'monthly', monthDay: 31, startsOn: '2027-01-01', timezone: 'UTC' },
    });
    expect(r.status).toBe(200);
    expect(r.body.data.summary).toBe('Every month on the 31st (or the last day) at 09:00');
    expect(r.body.data.next.length).toBe(5);
    expect((await api('u_tech', 'POST', '/api/tasks/recurrences/preview', { recurrence: { frequency: 'x' } })).status).toBe(400);
  });
});

describe('the calendar — projected occurrences', () => {
  it('projects series in the caller\'s workspace beyond what already exists, and not hourly ones', async () => {
    const start = today();
    const mine = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Mine weekly', department: 'Tech', assigneeIds: ['emp_dual'],
      recurrence: { frequency: 'weekly', timeOfDay: '00:00', startsOn: start, timezone: 'UTC' },
    });
    const viaCommittee = await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Committee monthly', department: 'Tech', assigneeIds: ['emp_hold'], committeeId: 'cmt_test',
      recurrence: { frequency: 'monthly', timeOfDay: '00:00', startsOn: start, timezone: 'UTC' },
    });
    await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Hourly ping', department: 'Tech', assigneeIds: ['emp_dual'],
      recurrence: { frequency: 'hourly', startsOn: start, timezone: 'UTC' },
    });
    await api('u_ceo', 'POST', '/api/tasks', {
      title: 'Not mine', department: 'Tech', assigneeIds: ['emp_hold'],
      recurrence: { frequency: 'daily', startsOn: start, timezone: 'UTC' },
    });

    const to = new Date(Date.now() + 60 * DAY_MS).toISOString().slice(0, 10);
    const r = await api('u_dual', 'GET', `/api/tasks/recurrences/upcoming?from=${start}&to=${to}`, undefined, 'emp_dual');
    expect(r.status).toBe(200);
    const titles = new Set(r.body.data.map((o: any) => o.title));
    expect(titles).toEqual(new Set(['Mine weekly', 'Committee monthly']));

    // Nothing projected that already exists as a task.
    const existing = new Set([
      ...(await occurrences(mine.body.data.recurrenceId)),
      ...(await occurrences(viaCommittee.body.data.recurrenceId)),
    ].map((o) => o.occurrence_at));
    for (const o of r.body.data) expect(existing.has(o.occurrenceAt)).toBe(false);
    // Roughly eight more weekly ones in sixty days.
    expect(r.body.data.filter((o: any) => o.title === 'Mine weekly').length).toBeGreaterThanOrEqual(7);
  });

  it('is empty for a login with no employee, and refuses an absurd window', async () => {
    expect((await api('u_ceo', 'GET', '/api/tasks/recurrences/upcoming')).body.data).toEqual([]);
    expect((await api('u_dual', 'GET', '/api/tasks/recurrences/upcoming?from=2027-01-01&to=2028-01-01', undefined, 'emp_dual')).status).toBe(400);
  });
});

describe('deleting what a series points at', () => {
  it('deleting a post deletes its series, says so first, and is not blocked by them', async () => {
    const { row } = await createSeries(
      db(), { title: 'PM weekly sync', department: 'Tech', appointmentId: 'ap_pm', assigneeIds: ['emp_dual'] },
      rule({ frequency: 'weekly', timeOfDay: '09:00', startsOn: '2027-01-04', timezone: 'UTC' }), null, utc('2027-01-04T10:00'),
    );
    const impact = await appointmentImpact(env as any, 'ap_pm');
    expect(impact!.items.find((i) => i.label === 'Repeating tasks addressed to this post')?.count).toBe(1);

    const done = await deleteAppointment(env as any, 'ap_pm');
    expect(done!.summary.repeatingTasks).toBe(1);
    expect(await env.DB.prepare('SELECT 1 FROM task_recurrences WHERE recurrence_id = ?').bind(row.id).first()).toBeNull();
    expect(await occurrences(row.id)).toEqual([]);
  });

  it('deleting the person who created a series keeps the series and clears the attribution', async () => {
    const { row } = await createSeries(
      db(), { title: 'Created by u_hold', department: 'Tech', assigneeIds: ['emp_dual'] },
      rule({ frequency: 'daily', startsOn: '2027-01-01', timezone: 'UTC' }), 'u_hold', utc('2027-01-01T10:00'),
    );
    expect(await deleteEmployee(env as any, 'emp_hold')).not.toBeNull();
    expect((await seriesRow(row.id)).creatorId).toBeNull();
  });

  it('a post whose task has logged time can still be deleted', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO universal_tasks (task_id,title,status,department,appointment_id,board_position,created_at,updated_at) VALUES ('t_logged','Logged','todo','Tech','ap_cmo',0,0,0)`),
      env.DB.prepare(`INSERT INTO work_days (work_day_id,employee_id,work_date,timezone,logged_ms,paused_ms,created_at,updated_at) VALUES ('wd_1','emp_dual','2027-01-01','UTC',${HOUR_MS},0,0,0)`),
      env.DB.prepare(`INSERT INTO time_entries (time_entry_id,work_day_id,employee_id,kind,started_at,ended_at,task_id,source,time_unknown,created_at) VALUES ('te_1','wd_1','emp_dual','work',0,${HOUR_MS},'t_logged','manual',0,0)`),
    ]);
    expect(await deleteAppointment(env as any, 'ap_cmo')).not.toBeNull();
    expect((await env.DB.prepare(`SELECT task_id FROM time_entries WHERE time_entry_id = 'te_1'`).first<any>()).task_id).toBeNull();
  });
});
