/**
 * Time logging: the state machine, edits, the forgotten-timer sweep and the reads.
 *
 * Written against D1 directly rather than through Drizzle because every write here
 * is a CONDITIONAL batch — "close this interval only if it is still open, and open
 * the next only if that close was ours" — and those conditions are SQL, not
 * builder calls. D1 applies a batch as one transaction, so a timer action either
 * happens whole or not at all.
 *
 * The invariant everything leans on is the partial unique index
 * `time_entries_one_open`: at most one running interval per person. A second
 * `start` from another tab is refused by the database, not by a read-then-write
 * check that two requests could both pass.
 *
 * See docs/attendance-design.md. Nothing here knows about schedules, required hours,
 * lateness or pay, and nothing should: pay is per task and nobody owes hours.
 */
import { generateId } from '../utils/id';
import {
  DAY_MS, HOUR_MS, DEFAULT_TIMEZONE, localDate, localToUtc, isIsoDate, hourProfile, lengthOf, localDayBounds,
} from './clock';

/** How far back a person may add or change their own time. Older needs a head or HR. */
export const SELF_EDIT_WINDOW_MS = 14 * DAY_MS;
/** The forgotten-timer caps. Generous on purpose: they stop a weekend-long timer, they do not guess when somebody left. */
export const MAX_OPEN_WORK_MS = 16 * HOUR_MS;
export const MAX_OPEN_PAUSE_MS = 12 * HOUR_MS;
/** The longest single interval anyone may enter by hand. */
export const MAX_MANUAL_MS = 24 * HOUR_MS;

export type Kind = 'work' | 'pause';
export type TimerState = 'idle' | 'working' | 'paused';
export type Action = 'start' | 'pause' | 'resume' | 'switch' | 'done';

export type Entry = {
  id: string;
  dayId: string;
  employeeId: string;
  kind: Kind;
  startedAt: number;
  endedAt: number | null;
  taskId: string | null;
  taskTitle?: string | null;
  note: string | null;
  source: 'timer' | 'manual' | 'legacy';
  timeUnknown: boolean;
  autoClosed: boolean;
  editedAt: number | null;
  originalStartedAt: number | null;
  originalEndedAt: number | null;
  originalTaskId: string | null;
  createdAt: number;
};

export type Day = {
  id: string;
  employeeId: string;
  workDate: string;
  timezone: string;
  loggedMs: number;
  pausedMs: number;
};

type Row = Record<string, unknown>;

const ENTRY_COLUMNS = `
  t.time_entry_id, t.work_day_id, t.employee_id, t.kind, t.started_at, t.ended_at, t.task_id,
  t.note, t.source, t.time_unknown, t.auto_closed, t.edited_at, t.original_started_at,
  t.original_ended_at, t.original_task_id, t.created_at`;

function toEntry(r: Row): Entry {
  return {
    id: r.time_entry_id as string,
    dayId: r.work_day_id as string,
    employeeId: r.employee_id as string,
    kind: r.kind as Kind,
    startedAt: Number(r.started_at),
    endedAt: r.ended_at == null ? null : Number(r.ended_at),
    taskId: (r.task_id as string) ?? null,
    ...(r.task_title !== undefined ? { taskTitle: (r.task_title as string) ?? null } : {}),
    note: (r.note as string) ?? null,
    source: r.source as Entry['source'],
    timeUnknown: !!r.time_unknown,
    autoClosed: !!r.auto_closed,
    editedAt: r.edited_at == null ? null : Number(r.edited_at),
    originalStartedAt: r.original_started_at == null ? null : Number(r.original_started_at),
    originalEndedAt: r.original_ended_at == null ? null : Number(r.original_ended_at),
    originalTaskId: (r.original_task_id as string) ?? null,
    createdAt: Number(r.created_at),
  };
}

function toDay(r: Row): Day {
  return {
    id: r.work_day_id as string,
    employeeId: r.employee_id as string,
    workDate: r.work_date as string,
    timezone: r.timezone as string,
    loggedMs: Number(r.logged_ms ?? 0),
    pausedMs: Number(r.paused_ms ?? 0),
  };
}

/** A failure the caller should show as-is. `status` is the HTTP status it maps to. */
export class TimeError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

// ── Lookups ──────────────────────────────────────────────────────────────────

export async function employeeTimezone(db: D1Database, employeeId: string): Promise<string> {
  const r = await db.prepare('SELECT timezone FROM employees WHERE employee_id = ?').bind(employeeId).first<Row>();
  return (r?.timezone as string) || DEFAULT_TIMEZONE;
}

export async function openEntry(db: D1Database, employeeId: string): Promise<Entry | null> {
  const r = await db
    .prepare(`SELECT ${ENTRY_COLUMNS}, u.title AS task_title FROM time_entries t
              LEFT JOIN universal_tasks u ON u.task_id = t.task_id
              WHERE t.employee_id = ? AND t.ended_at IS NULL`)
    .bind(employeeId)
    .first<Row>();
  return r ? toEntry(r) : null;
}

/** The task of the most recent work interval — what `resume` returns to by default. */
async function lastWorkTask(db: D1Database, employeeId: string): Promise<string | null> {
  const r = await db
    .prepare(`SELECT task_id FROM time_entries WHERE employee_id = ? AND kind = 'work'
              ORDER BY started_at DESC LIMIT 1`)
    .bind(employeeId)
    .first<Row>();
  return (r?.task_id as string) ?? null;
}

/**
 * Tasks this person may log time against: assigned to them, or belonging to an
 * active appointment they hold or a committee they sit on. The same set the
 * workspace (`GET /api/dashboard/me`) shows them, so the picker offers exactly the
 * work they can already see.
 */
const LOGGABLE_TASKS = `
  SELECT u.task_id, u.title, u.status, u.department
  FROM universal_tasks u
  WHERE u.task_id IN (SELECT task_id FROM task_assignments WHERE employee_id = ?1)
     OR u.appointment_id IN (SELECT appointment_id FROM appointments WHERE employee_id = ?1 AND is_active = 1)
     OR u.committee_id IN (SELECT committee_id FROM committee_members WHERE employee_id = ?1)`;

export async function loggableTasks(db: D1Database, employeeId: string) {
  const { results } = await db
    .prepare(`${LOGGABLE_TASKS}
              ORDER BY CASE u.status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
                       u.updated_at DESC
              LIMIT 200`)
    .bind(employeeId)
    .all<Row>();
  return results.map((r) => ({
    id: r.task_id as string,
    title: r.title as string,
    status: r.status as string,
    department: r.department as string,
  }));
}

export async function canLogOnTask(db: D1Database, employeeId: string, taskId: string): Promise<boolean> {
  const r = await db
    .prepare(`SELECT 1 AS ok FROM (${LOGGABLE_TASKS}) WHERE task_id = ?2`)
    .bind(employeeId, taskId)
    .first<Row>();
  return !!r;
}

/** `undefined` keeps the default, `null` means general work, a string must be loggable. */
async function checkTask(db: D1Database, employeeId: string, taskId: unknown): Promise<string | null | undefined> {
  if (taskId === undefined) return undefined;
  if (taskId === null || taskId === '') return null;
  if (typeof taskId !== 'string') throw new TimeError(400, 'taskId must be a string or null');
  if (!(await canLogOnTask(db, employeeId, taskId))) {
    throw new TimeError(403, 'You can only log time on tasks assigned to you or your posts');
  }
  return taskId;
}

// ── Statements ───────────────────────────────────────────────────────────────

function ensureDay(db: D1Database, employeeId: string, date: string, tz: string, now: number): D1PreparedStatement {
  return db
    .prepare(`INSERT OR IGNORE INTO work_days
              (work_day_id, employee_id, work_date, timezone, logged_ms, paused_ms, created_at, updated_at)
              VALUES (?, ?, ?, ?, 0, 0, ?, ?)`)
    .bind(generateId('wkd'), employeeId, date, tz, now, now);
}

type NewEntry = {
  id: string;
  employeeId: string;
  date: string;
  kind: Kind;
  startedAt: number;
  endedAt: number | null;
  taskId: string | null;
  note: string | null;
  source: Entry['source'];
  timeUnknown: boolean;
  now: number;
};

/**
 * Inserts into the day for (`employeeId`, `date`), which must exist by the time
 * this runs — `ensureDay` earlier in the same batch. With `afterClose`, the insert
 * happens only if THAT entry was closed at exactly that instant, i.e. by this
 * request: a concurrent `done` that closed it first leaves nothing to open.
 */
function insertEntry(db: D1Database, e: NewEntry, afterClose?: { id: string; at: number }): D1PreparedStatement {
  const guard = afterClose
    ? 'AND EXISTS (SELECT 1 FROM time_entries x WHERE x.time_entry_id = ? AND x.ended_at = ?)'
    : '';
  const stmt = db.prepare(
    `INSERT INTO time_entries
     (time_entry_id, work_day_id, employee_id, kind, started_at, ended_at, task_id, note, source,
      time_unknown, auto_closed, created_at)
     SELECT ?, d.work_day_id, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?
     FROM work_days d WHERE d.employee_id = ? AND d.work_date = ? ${guard}`,
  );
  const binds: unknown[] = [
    e.id, e.employeeId, e.kind, e.startedAt, e.endedAt, e.kind === 'work' ? e.taskId : null, e.note, e.source,
    e.timeUnknown ? 1 : 0, e.now, e.employeeId, e.date,
  ];
  if (afterClose) binds.push(afterClose.id, afterClose.at);
  return stmt.bind(...binds);
}

function closeEntry(db: D1Database, id: string, at: number): D1PreparedStatement {
  return db.prepare('UPDATE time_entries SET ended_at = ? WHERE time_entry_id = ? AND ended_at IS NULL').bind(at, id);
}

/**
 * Recomputes the cached totals of the given days, and of the days for the given
 * local dates. The caches exist only so a list of days need not load every entry;
 * they are always rewritten from the entries, never adjusted by a delta that could
 * drift.
 */
function recompute(db: D1Database, employeeId: string, dayIds: string[], dates: string[], now: number): D1PreparedStatement {
  const ids = dayIds.length ? dayIds : [''];
  const ds = dates.length ? dates : [''];
  return db
    .prepare(
      `UPDATE work_days SET
         logged_ms = COALESCE((SELECT SUM(t.ended_at - t.started_at) FROM time_entries t
                               WHERE t.work_day_id = work_days.work_day_id AND t.kind = 'work' AND t.ended_at IS NOT NULL), 0),
         paused_ms = COALESCE((SELECT SUM(t.ended_at - t.started_at) FROM time_entries t
                               WHERE t.work_day_id = work_days.work_day_id AND t.kind = 'pause' AND t.ended_at IS NOT NULL), 0),
         updated_at = ?
       WHERE employee_id = ?
         AND (work_day_id IN (${ids.map(() => '?').join(',')}) OR work_date IN (${ds.map(() => '?').join(',')}))`,
    )
    .bind(now, employeeId, ...ids, ...ds);
}

/** A day exists only because time was logged on it; one left empty by an edit goes. */
function dropIfEmpty(db: D1Database, employeeId: string, dayIds: string[]): D1PreparedStatement {
  const ids = dayIds.length ? dayIds : [''];
  return db
    .prepare(
      `DELETE FROM work_days WHERE employee_id = ? AND work_day_id IN (${ids.map(() => '?').join(',')})
       AND NOT EXISTS (SELECT 1 FROM time_entries t WHERE t.work_day_id = work_days.work_day_id)`,
    )
    .bind(employeeId, ...ids);
}

// ── State ────────────────────────────────────────────────────────────────────

export type TimeState = {
  state: TimerState;
  openEntry: Entry | null;
  timezone: string;
  today: { date: string; loggedMs: number; pausedMs: number };
  lastTaskId: string | null;
  serverNow: number;
};

export async function getState(db: D1Database, employeeId: string, now: number): Promise<TimeState> {
  const tz = await employeeTimezone(db, employeeId);
  const open = await openEntry(db, employeeId);
  const date = localDate(now, tz);
  const day = await db
    .prepare('SELECT * FROM work_days WHERE employee_id = ? AND work_date = ?')
    .bind(employeeId, date)
    .first<Row>();
  let loggedMs = day ? Number(day.logged_ms) : 0;
  let pausedMs = day ? Number(day.paused_ms) : 0;
  // The running interval is not in the cache yet; count the part of it that is today's.
  if (open && day && open.dayId === day.work_day_id) {
    if (open.kind === 'work') loggedMs += lengthOf(open, now);
    else pausedMs += lengthOf(open, now);
  }
  return {
    state: !open ? 'idle' : open.kind === 'work' ? 'working' : 'paused',
    openEntry: open,
    timezone: tz,
    today: { date, loggedMs, pausedMs },
    lastTaskId: await lastWorkTask(db, employeeId),
    serverNow: now,
  };
}

// ── The state machine ────────────────────────────────────────────────────────

/**
 * One timer action, as one batch. Returns the new state.
 *
 * Every transition closes the open interval at `closeAt` and opens the next at the
 * same instant, so a session has no gaps and no overlaps by construction. Time
 * always comes from the server; the client never sends a timestamp for a timer
 * action.
 */
export async function transition(
  db: D1Database,
  employeeId: string,
  action: Action,
  opts: { taskId?: unknown },
  now: number,
): Promise<TimeState> {
  const tz = await employeeTimezone(db, employeeId);
  const open = await openEntry(db, employeeId);
  const date = localDate(now, tz);
  const conflict = (msg: string) => new TimeError(409, msg);

  if (action === 'start') {
    if (open) throw conflict(open.kind === 'work' ? 'A timer is already running' : 'You are paused — resume instead');
    const taskId = await checkTask(db, employeeId, opts.taskId);
    try {
      await db.batch([
        ensureDay(db, employeeId, date, tz, now),
        insertEntry(db, {
          id: generateId('tme'), employeeId, date, kind: 'work', startedAt: now, endedAt: null,
          taskId: taskId ?? null, note: null, source: 'timer', timeUnknown: false, now,
        }),
      ]);
    } catch (err) {
      // Lost the race to another tab: the partial unique index refused the second open interval.
      if (isUniqueViolation(err)) throw conflict('A timer is already running');
      throw err;
    }
    return getState(db, employeeId, now);
  }

  if (!open) throw conflict('Nothing is running');
  const expected: Record<Exclude<Action, 'start'>, Kind | null> = {
    pause: 'work', resume: 'pause', switch: 'work', done: null,
  };
  const need = expected[action];
  if (need && open.kind !== need) {
    throw conflict(need === 'work' ? 'You are paused — resume first' : 'The timer is not paused');
  }

  // Never close at or before the start: the CHECK would refuse it, and a zero-length
  // interval is meaningless. One millisecond is the smallest honest length.
  const closeAt = Math.max(now, open.startedAt + 1);
  const writes: D1PreparedStatement[] = [];
  let next: NewEntry | null = null;

  if (action === 'pause') {
    next = { id: generateId('tme'), employeeId, date, kind: 'pause', startedAt: closeAt, endedAt: null, taskId: null, note: null, source: 'timer', timeUnknown: false, now };
  } else if (action === 'resume' || action === 'switch') {
    let taskId = await checkTask(db, employeeId, opts.taskId);
    if (taskId === undefined) taskId = action === 'resume' ? await lastWorkTask(db, employeeId) : null;
    next = { id: generateId('tme'), employeeId, date, kind: 'work', startedAt: closeAt, endedAt: null, taskId, note: null, source: 'timer', timeUnknown: false, now };
  }

  if (next) writes.push(ensureDay(db, employeeId, date, tz, now));
  const closeIndex = writes.length;
  writes.push(closeEntry(db, open.id, closeAt));
  if (next) writes.push(insertEntry(db, next, { id: open.id, at: closeAt }));
  writes.push(recompute(db, employeeId, [open.dayId], [date], now));

  const results = await db.batch(writes);
  if ((results[closeIndex]?.meta?.changes ?? 0) !== 1) {
    // Somebody else (another tab, the sweep) closed it first. Nothing of ours applied
    // except an idempotent day row and a recompute, which are harmless.
    throw conflict('The timer changed in another window — refreshed');
  }
  return getState(db, employeeId, now);
}

// ── Manual entries and edits ────────────────────────────────────────────────

export type ManualInput = {
  date?: unknown;
  minutes?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  taskId?: unknown;
  note?: unknown;
};

function toMs(v: unknown, field: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(n)) throw new TimeError(400, `${field} must be a timestamp`);
  return Math.round(n);
}

function cleanNote(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw new TimeError(400, 'note must be text');
  return v.slice(0, 500);
}

/**
 * Resolves a manual input to an interval. Either clock times (`startedAt` +
 * `endedAt`) or a duration on a date (`date` + `minutes`) — the second exists
 * because forgotten time is remembered as "about two hours on Tuesday", and
 * making somebody invent 10:05–12:10 puts false precision into the record.
 */
function resolveInterval(input: ManualInput, tz: string): { startedAt: number; endedAt: number; date: string; timeUnknown: boolean } {
  if (input.minutes !== undefined && input.minutes !== null) {
    const minutes = Number(input.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes * 60_000 > MAX_MANUAL_MS) {
      throw new TimeError(400, 'minutes must be between 1 and 1440');
    }
    if (!isIsoDate(input.date)) throw new TimeError(400, 'date must be YYYY-MM-DD');
    const startedAt = localToUtc(input.date, 12, 0, tz);
    return { startedAt, endedAt: startedAt + Math.round(minutes) * 60_000, date: input.date, timeUnknown: true };
  }
  const startedAt = toMs(input.startedAt, 'startedAt');
  const endedAt = toMs(input.endedAt, 'endedAt');
  if (endedAt <= startedAt) throw new TimeError(400, 'The end must be after the start');
  if (endedAt - startedAt > MAX_MANUAL_MS) throw new TimeError(400, 'One entry cannot be longer than 24 hours');
  return { startedAt, endedAt, date: localDate(startedAt, tz), timeUnknown: false };
}

async function assertNoOverlap(db: D1Database, employeeId: string, s: number, e: number, now: number, exceptId?: string) {
  // Duration-only entries have no real position, so they neither block nor are blocked.
  const r = await db
    .prepare(`SELECT time_entry_id FROM time_entries
              WHERE employee_id = ? AND time_unknown = 0 AND time_entry_id <> ?
                AND started_at < ? AND COALESCE(ended_at, ?) > ? LIMIT 1`)
    .bind(employeeId, exceptId ?? '', e, now, s)
    .first<Row>();
  if (r) throw new TimeError(400, 'That overlaps time already logged');
}

export type EditAuthority = {
  /** May touch entries older than SELF_EDIT_WINDOW_MS (a department head, or hr/attendance edit). */
  beyondWindow: boolean;
};

function assertWindow(startedAt: number, now: number, auth: EditAuthority) {
  if (startedAt > now) throw new TimeError(400, 'Time cannot be logged in the future');
  if (!auth.beyondWindow && startedAt < now - SELF_EDIT_WINDOW_MS) {
    throw new TimeError(403, 'Entries older than 14 days can be changed by your department head or HR');
  }
}

export async function addManual(
  db: D1Database, employeeId: string, input: ManualInput, now: number, auth: EditAuthority,
): Promise<Entry> {
  const tz = await employeeTimezone(db, employeeId);
  const iv = resolveInterval(input, tz);
  assertWindow(iv.startedAt, now, auth);
  if (!iv.timeUnknown && iv.endedAt > now) throw new TimeError(400, 'Time cannot be logged in the future');
  if (!iv.timeUnknown) await assertNoOverlap(db, employeeId, iv.startedAt, iv.endedAt, now);
  const taskId = (await checkTask(db, employeeId, input.taskId)) ?? null;
  const id = generateId('tme');
  await db.batch([
    ensureDay(db, employeeId, iv.date, tz, now),
    insertEntry(db, {
      id, employeeId, date: iv.date, kind: 'work', startedAt: iv.startedAt, endedAt: iv.endedAt,
      taskId, note: cleanNote(input.note) ?? null, source: 'manual', timeUnknown: iv.timeUnknown, now,
    }),
    recompute(db, employeeId, [], [iv.date], now),
  ]);
  return (await getEntry(db, id))!;
}

export async function getEntry(db: D1Database, id: string): Promise<Entry | null> {
  const r = await db
    .prepare(`SELECT ${ENTRY_COLUMNS}, u.title AS task_title FROM time_entries t
              LEFT JOIN universal_tasks u ON u.task_id = t.task_id WHERE t.time_entry_id = ?`)
    .bind(id)
    .first<Row>();
  return r ? toEntry(r) : null;
}

/**
 * Edits a closed entry. No approval — pay does not depend on these numbers, and a
 * gate on somebody's own time log would be a control over their hours. Instead the
 * edit is VISIBLE: the first one preserves what the timer recorded in `original_*`,
 * `edited_at` marks it, and the audit log keeps every change.
 */
export async function editEntry(
  db: D1Database, entry: Entry, input: ManualInput, now: number, auth: EditAuthority,
): Promise<Entry> {
  if (entry.endedAt == null) throw new TimeError(409, 'Stop the timer before editing this entry');
  assertWindow(entry.startedAt, now, auth);

  const day = await db.prepare('SELECT * FROM work_days WHERE work_day_id = ?').bind(entry.dayId).first<Row>();
  const tz = (day?.timezone as string) || (await employeeTimezone(db, entry.employeeId));

  let startedAt = entry.startedAt;
  let endedAt = entry.endedAt;
  let timeUnknown = entry.timeUnknown;
  let date = (day?.work_date as string) || localDate(entry.startedAt, tz);

  const timesGiven = input.startedAt !== undefined || input.endedAt !== undefined;
  if (input.minutes !== undefined || timesGiven || input.date !== undefined) {
    const iv = resolveInterval(
      input.minutes !== undefined
        ? { date: input.date ?? date, minutes: input.minutes }
        : timesGiven
          ? { startedAt: input.startedAt ?? entry.startedAt, endedAt: input.endedAt ?? entry.endedAt }
          : entry.timeUnknown
            ? { date: input.date, minutes: (entry.endedAt - entry.startedAt) / 60_000 }
            : (() => { throw new TimeError(400, 'To move an entry with clock times, change its times'); })(),
      tz,
    );
    ({ startedAt, endedAt, timeUnknown, date } = iv);
    assertWindow(startedAt, now, auth);
    if (!timeUnknown && endedAt > now) throw new TimeError(400, 'Time cannot be logged in the future');
    if (!timeUnknown && entry.kind === 'work') await assertNoOverlap(db, entry.employeeId, startedAt, endedAt, now, entry.id);
  }

  let taskId = entry.taskId;
  if (input.taskId !== undefined) {
    if (entry.kind !== 'work') throw new TimeError(400, 'A pause has no task');
    taskId = (await checkTask(db, entry.employeeId, input.taskId)) ?? null;
  }
  const note = cleanNote(input.note);

  await db.batch([
    ensureDay(db, entry.employeeId, date, tz, now),
    db.prepare(
      `UPDATE time_entries SET
         original_started_at = COALESCE(original_started_at, CASE WHEN edited_at IS NULL THEN started_at END),
         original_ended_at   = COALESCE(original_ended_at,   CASE WHEN edited_at IS NULL THEN ended_at END),
         original_task_id    = CASE WHEN edited_at IS NULL THEN task_id ELSE original_task_id END,
         started_at = ?, ended_at = ?, time_unknown = ?, task_id = ?, note = COALESCE(?, note),
         work_day_id = (SELECT work_day_id FROM work_days WHERE employee_id = ? AND work_date = ?),
         edited_at = ?
       WHERE time_entry_id = ? AND ended_at IS NOT NULL`,
    ).bind(startedAt, endedAt, timeUnknown ? 1 : 0, taskId, note === null ? '' : note ?? null,
      entry.employeeId, date, now, entry.id),
    // `note = ''` above is how an explicit null clears it through COALESCE; normalise.
    db.prepare(`UPDATE time_entries SET note = NULL WHERE time_entry_id = ? AND note = ''`).bind(entry.id),
    recompute(db, entry.employeeId, [entry.dayId], [date], now),
    dropIfEmpty(db, entry.employeeId, [entry.dayId]),
  ]);
  return (await getEntry(db, entry.id))!;
}

export async function deleteEntry(db: D1Database, entry: Entry, now: number, auth: EditAuthority): Promise<void> {
  if (entry.endedAt == null) throw new TimeError(409, 'Stop the timer before deleting this entry');
  assertWindow(entry.startedAt, now, auth);
  await db.batch([
    db.prepare('DELETE FROM time_entries WHERE time_entry_id = ? AND ended_at IS NOT NULL').bind(entry.id),
    recompute(db, entry.employeeId, [entry.dayId], [], now),
    dropIfEmpty(db, entry.employeeId, [entry.dayId]),
  ]);
}

// ── The forgotten-timer sweep ────────────────────────────────────────────────

/**
 * Closes intervals left running past the caps, at `started + cap`, marked
 * `auto_closed`. Nobody is notified and nothing is flagged on the person: the next
 * time they open the dashboard they are asked to adjust it, and reports leave
 * auto-closed time out by default because it is almost certainly wrong.
 */
export async function sweepForgotten(db: D1Database, now: number): Promise<number> {
  const { results } = await db
    .prepare(`SELECT time_entry_id, employee_id, work_day_id, kind, started_at FROM time_entries
              WHERE ended_at IS NULL
                AND ((kind = 'work' AND started_at < ?) OR (kind = 'pause' AND started_at < ?))`)
    .bind(now - MAX_OPEN_WORK_MS, now - MAX_OPEN_PAUSE_MS)
    .all<Row>();
  if (results.length === 0) return 0;
  const writes: D1PreparedStatement[] = [];
  for (const r of results) {
    const cap = r.kind === 'work' ? MAX_OPEN_WORK_MS : MAX_OPEN_PAUSE_MS;
    writes.push(
      db.prepare('UPDATE time_entries SET ended_at = ?, auto_closed = 1 WHERE time_entry_id = ? AND ended_at IS NULL')
        .bind(Number(r.started_at) + cap, r.time_entry_id),
      recompute(db, r.employee_id as string, [r.work_day_id as string], [], now),
    );
  }
  await db.batch(writes);
  return results.length;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listDays(db: D1Database, employeeId: string, from: string, to: string) {
  const { results } = await db
    .prepare(`SELECT d.*,
                (SELECT COUNT(*) FROM time_entries t WHERE t.work_day_id = d.work_day_id) AS entry_count,
                (SELECT COUNT(*) FROM time_entries t WHERE t.work_day_id = d.work_day_id
                   AND (t.edited_at IS NOT NULL OR t.source = 'manual')) AS changed_count,
                (SELECT COUNT(*) FROM time_entries t WHERE t.work_day_id = d.work_day_id AND t.auto_closed = 1) AS auto_closed_count,
                (SELECT COUNT(*) FROM time_entries t WHERE t.work_day_id = d.work_day_id AND t.ended_at IS NULL) AS running
              FROM work_days d
              WHERE d.employee_id = ? AND d.work_date >= ? AND d.work_date <= ?
              ORDER BY d.work_date DESC`)
    .bind(employeeId, from, to)
    .all<Row>();
  return results.map((r) => ({
    ...toDay(r),
    entryCount: Number(r.entry_count),
    changedCount: Number(r.changed_count),
    autoClosedCount: Number(r.auto_closed_count),
    running: Number(r.running) > 0,
  }));
}

export async function dayById(db: D1Database, dayId: string): Promise<Day | null> {
  const r = await db.prepare('SELECT * FROM work_days WHERE work_day_id = ?').bind(dayId).first<Row>();
  return r ? toDay(r) : null;
}

export async function dayByDate(db: D1Database, employeeId: string, date: string): Promise<Day | null> {
  const r = await db.prepare('SELECT * FROM work_days WHERE employee_id = ? AND work_date = ?').bind(employeeId, date).first<Row>();
  return r ? toDay(r) : null;
}

/** One day, in full: its entries, the 24-hour profile and the per-task totals. */
export async function dayDetail(db: D1Database, day: Day, now: number) {
  const { results } = await db
    .prepare(`SELECT ${ENTRY_COLUMNS}, u.title AS task_title FROM time_entries t
              LEFT JOIN universal_tasks u ON u.task_id = t.task_id
              WHERE t.work_day_id = ? ORDER BY t.started_at`)
    .bind(day.id)
    .all<Row>();
  const entries = results.map(toEntry);
  const byTask = new Map<string, { taskId: string | null; title: string | null; ms: number }>();
  for (const e of entries) {
    if (e.kind !== 'work') continue;
    const key = e.taskId ?? '';
    const cur = byTask.get(key) ?? { taskId: e.taskId, title: e.taskTitle ?? null, ms: 0 };
    cur.ms += lengthOf(e, now);
    byTask.set(key, cur);
  }
  return {
    day,
    entries,
    hours: hourProfile(entries, day.timezone, now),
    byTask: [...byTask.values()].sort((a, b) => b.ms - a.ms),
  };
}

/**
 * Recent workdays on which this person touched a task but logged nothing.
 *
 * Shown ONLY to that person, as an offer to fill the gap, and dismissible in the
 * client. Task activity is used to prefill the form and never counted as time:
 * changing a status is not evidence of how long somebody worked.
 */
export async function missedDays(db: D1Database, userId: string, employeeId: string, now: number) {
  const tz = await employeeTimezone(db, employeeId);
  const today = localDate(now, tz);
  const since = Math.floor((now - 7 * DAY_MS) / 1000);
  const { results } = await db
    .prepare(`SELECT a.timestamp, a.record_id, u.title FROM audit_logs a
              JOIN universal_tasks u ON u.task_id = a.record_id
              WHERE a.user_id = ? AND a.table_name = 'universal_tasks' AND a.timestamp >= ?
              ORDER BY a.timestamp DESC LIMIT 200`)
    .bind(userId, since)
    .all<Row>();
  const byDate = new Map<string, Map<string, string>>();
  for (const r of results) {
    const date = localDate(Number(r.timestamp) * 1000, tz);
    if (date === today) continue; // today is still in progress
    if (!byDate.has(date)) byDate.set(date, new Map());
    byDate.get(date)!.set(r.record_id as string, r.title as string);
  }
  if (byDate.size === 0) return [];
  const dates = [...byDate.keys()];
  const { results: logged } = await db
    .prepare(`SELECT work_date FROM work_days WHERE employee_id = ? AND work_date IN (${dates.map(() => '?').join(',')})`)
    .bind(employeeId, ...dates)
    .all<Row>();
  const have = new Set(logged.map((r) => r.work_date as string));
  return dates
    .filter((d) => !have.has(d))
    .sort()
    .reverse()
    .map((date) => ({ date, tasks: [...byDate.get(date)!].map(([id, title]) => ({ id, title })) }));
}

/** Sessions the sweep closed in the last fortnight, for the "adjust it?" prompt. */
export async function recentAutoClosed(db: D1Database, employeeId: string, now: number): Promise<Entry[]> {
  const { results } = await db
    .prepare(`SELECT ${ENTRY_COLUMNS}, u.title AS task_title FROM time_entries t
              LEFT JOIN universal_tasks u ON u.task_id = t.task_id
              WHERE t.employee_id = ? AND t.auto_closed = 1 AND t.edited_at IS NULL AND t.started_at >= ?
              ORDER BY t.started_at DESC LIMIT 5`)
    .bind(employeeId, now - SELF_EDIT_WINDOW_MS)
    .all<Row>();
  return results.map(toEntry);
}

/**
 * Time on one task: the total, and who contributed how much.
 *
 * Auto-closed time is reported separately and not counted. A contribution split is
 * a description of a piece of work, not a rating of the people in it — the UI shows
 * no rank, badge or colour scale, and nothing here compares people across tasks.
 */
export async function taskTime(db: D1Database, taskId: string) {
  const { results } = await db
    .prepare(`SELECT t.employee_id, e.name,
                SUM(CASE WHEN t.auto_closed = 0 THEN t.ended_at - t.started_at ELSE 0 END) AS ms,
                SUM(CASE WHEN t.auto_closed = 0 AND t.time_unknown = 1 THEN t.ended_at - t.started_at ELSE 0 END) AS unknown_ms,
                SUM(CASE WHEN t.auto_closed = 0 AND (t.edited_at IS NOT NULL OR t.source = 'manual') THEN t.ended_at - t.started_at ELSE 0 END) AS changed_ms,
                SUM(CASE WHEN t.auto_closed = 1 THEN t.ended_at - t.started_at ELSE 0 END) AS auto_ms
              FROM time_entries t JOIN employees e ON e.employee_id = t.employee_id
              WHERE t.task_id = ? AND t.kind = 'work' AND t.ended_at IS NOT NULL
              GROUP BY t.employee_id, e.name`)
    .bind(taskId)
    .all<Row>();
  const running = await db
    .prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE task_id = ? AND ended_at IS NULL`)
    .bind(taskId)
    .first<Row>();
  const contributors = results
    .map((r) => ({ employeeId: r.employee_id as string, name: r.name as string, ms: Number(r.ms ?? 0) }))
    .filter((c) => c.ms > 0)
    .sort((a, b) => b.ms - a.ms);
  const totalMs = contributors.reduce((s, c) => s + c.ms, 0);
  return {
    totalMs,
    contributors: contributors.map((c) => ({ ...c, share: totalMs ? c.ms / totalMs : 0 })),
    durationOnlyMs: results.reduce((s, r) => s + Number(r.unknown_ms ?? 0), 0),
    changedMs: results.reduce((s, r) => s + Number(r.changed_ms ?? 0), 0),
    autoClosedMs: results.reduce((s, r) => s + Number(r.auto_ms ?? 0), 0),
    runningNow: Number(running?.n ?? 0),
  };
}

export type ReportGroup = 'department' | 'task_type' | 'task' | 'week';

/**
 * The organisation report. Aggregates only — there is no grouping by person, so a
 * company-wide table of people by hours cannot be produced from here. Per-person
 * time is read one person at a time, by somebody entitled to it.
 */
export async function report(
  db: D1Database,
  opts: { from: string; to: string; group: ReportGroup; department?: string; includeAutoClosed?: boolean },
) {
  const key: Record<ReportGroup, string> = {
    department: `COALESCE(u.department, '(no task)')`,
    task_type: `COALESCE(u.task_type, CASE WHEN u.task_id IS NULL THEN '(no task)' ELSE '(no type)' END)`,
    task: `COALESCE(u.task_id, '')`,
    week: `strftime('%Y-W%W', d.work_date)`,
  };
  const label = opts.group === 'task' ? `COALESCE(u.title, '(no task)')` : key[opts.group];
  const where = [`t.kind = 'work'`, `t.ended_at IS NOT NULL`, `d.work_date >= ?`, `d.work_date <= ?`];
  const binds: unknown[] = [opts.from, opts.to];
  if (!opts.includeAutoClosed) where.push('t.auto_closed = 0');
  if (opts.department) { where.push('LOWER(u.department) = LOWER(?)'); binds.push(opts.department); }
  const { results } = await db
    .prepare(`SELECT ${key[opts.group]} AS k, ${label} AS label,
                SUM(t.ended_at - t.started_at) AS ms,
                COUNT(DISTINCT t.employee_id) AS people,
                COUNT(DISTINCT t.task_id) AS tasks,
                SUM(CASE WHEN t.edited_at IS NOT NULL OR t.source = 'manual' THEN t.ended_at - t.started_at ELSE 0 END) AS changed_ms,
                MAX(u.status) AS status, MAX(u.created_at) AS task_created, MAX(u.completed_at) AS task_completed,
                MIN(t.started_at) AS first_logged
              FROM time_entries t
              JOIN work_days d ON d.work_day_id = t.work_day_id
              LEFT JOIN universal_tasks u ON u.task_id = t.task_id
              WHERE ${where.join(' AND ')}
              GROUP BY k ORDER BY ms DESC LIMIT 500`)
    .bind(...binds)
    .all<Row>();
  const rows = results.map((r) => ({
    key: r.k as string,
    label: r.label as string,
    ms: Number(r.ms ?? 0),
    people: Number(r.people ?? 0),
    tasks: Number(r.tasks ?? 0),
    changedMs: Number(r.changed_ms ?? 0),
    ...(opts.group === 'task'
      ? {
          status: (r.status as string) ?? null,
          // Cycle time: created → first logged → completed. Task timestamps are seconds.
          createdAt: r.task_created == null ? null : Number(r.task_created) * 1000,
          firstLoggedAt: r.first_logged == null ? null : Number(r.first_logged),
          completedAt: r.task_completed == null ? null : Number(r.task_completed) * 1000,
        }
      : {}),
  }));
  const totalMs = rows.reduce((s, r) => s + r.ms, 0);
  const untrackedMs = opts.group === 'task' ? rows.filter((r) => !r.key).reduce((s, r) => s + r.ms, 0) : undefined;
  return { from: opts.from, to: opts.to, group: opts.group, totalMs, untrackedMs, rows };
}

/** How many people have a work timer running. A count, never names. */
export async function loggingNow(db: D1Database): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(DISTINCT employee_id) AS n FROM time_entries WHERE ended_at IS NULL AND kind = 'work'`)
    .first<Row>();
  return Number(r?.n ?? 0);
}

/** Default reporting range: the last 30 local days in `tz`. */
export function defaultRange(now: number, tz: string): { from: string; to: string } {
  return { from: localDate(now - 29 * DAY_MS, tz), to: localDate(now, tz) };
}

export { localDayBounds };
