/**
 * Repeating tasks — the rule and its occurrences. Pure: no database, no clock.
 *
 * A rule names WHEN; `src/tasks/recurring.ts` turns each occurrence into an
 * ordinary `universal_tasks` row. Keeping the arithmetic here, apart from the
 * writes, is what lets the awkward cases be tested exhaustively: the 31st in a
 * 30-day month, the 29th of February, a weekly rule across a DST change.
 *
 * ## The model
 *
 * Every rule is a frequency, an interval and a local wall-clock time:
 *
 * | frequency | occurs                                                          |
 * |-----------|-----------------------------------------------------------------|
 * | hourly    | every `interval` hours from the first occurrence (absolute)     |
 * | daily     | every `interval` days at `timeOfDay`                            |
 * | weekly    | on each of `weekdays`, every `interval` weeks, at `timeOfDay`   |
 * | monthly   | on `monthDay`, every `interval` months, at `timeOfDay`          |
 *
 * "Custom" in the UI is not a fifth frequency — it is these four with an interval,
 * a weekday set or a day of the month chosen explicitly.
 *
 * Wall-clock times are in the rule's own `timezone`, so "every Monday at 09:00"
 * stays at 09:00 across a DST change rather than drifting by an hour. Hourly is
 * the exception and is deliberately absolute: "every 2 hours" means two hours of
 * real time, including across a change.
 *
 * **A month day past the end of a month falls on its last day.** "The 31st" is
 * 30 April, 28 February and 29 February in a leap year, and back to the 31st in
 * May — the day is clamped per month, never carried, so a rule does not slide.
 */

import { localDate, localToUtc, isIsoDate, isValidTimeZone, DEFAULT_TIMEZONE, HOUR_MS, DAY_MS } from '../time/clock';

export const FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface Rule {
  frequency: Frequency;
  interval: number;
  /** 0 = Sunday … 6 = Saturday. Weekly only; sorted, unique, non-empty. */
  weekdays: number[];
  /** 1–31. Monthly only. */
  monthDay: number | null;
  /** HH:MM, local to `timezone`. For hourly, the time of the first occurrence. */
  timeOfDay: string;
  timezone: string;
  /** YYYY-MM-DD. Nothing occurs before this date. */
  startsOn: string;
  /** YYYY-MM-DD, inclusive. Null repeats indefinitely. */
  endsOn: string | null;
}

/** How far apart occurrences may be, per frequency. Past these a rule is a typo. */
const MAX_INTERVAL: Record<Frequency, number> = { hourly: 168, daily: 365, weekly: 52, monthly: 24 };

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ── Plain-date arithmetic (no zones involved) ────────────────────────────── */

function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const [a, b, c] = ymd(from);
  const [x, y, z] = ymd(to);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / DAY_MS);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The `monthDay`th of a month, clamped to the month's last day. */
export function clampedMonthDate(year: number, month: number, monthDay: number): string {
  return fmt(year, month, Math.min(monthDay, daysInMonth(year, month)));
}

function hm(timeOfDay: string): [number, number] {
  const [h, m] = timeOfDay.split(':').map(Number);
  return [h, m];
}

/* ── Validation ───────────────────────────────────────────────────────────── */

export type RuleInput = {
  frequency?: unknown;
  interval?: unknown;
  weekdays?: unknown;
  monthDay?: unknown;
  timeOfDay?: unknown;
  timezone?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
};

/**
 * A rule from untrusted input, or the reason it is not one.
 *
 * Defaults are filled from `startsOn`, so the simple presets need nothing else:
 * "weekly" repeats on the start date's weekday, "monthly" on its day of the month.
 */
export function parseRule(input: RuleInput): { rule: Rule } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'recurrence must be an object' };

  const frequency = input.frequency;
  if (typeof frequency !== 'string' || !(FREQUENCIES as readonly string[]).includes(frequency)) {
    return { error: `recurrence.frequency must be one of ${FREQUENCIES.join(', ')}` };
  }
  const f = frequency as Frequency;

  const interval = input.interval === undefined || input.interval === null ? 1 : Number(input.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL[f]) {
    return { error: `recurrence.interval must be a whole number from 1 to ${MAX_INTERVAL[f]} for ${f}` };
  }

  if (!isIsoDate(input.startsOn)) return { error: 'recurrence.startsOn must be a date (YYYY-MM-DD)' };
  const startsOn = input.startsOn;

  let endsOn: string | null = null;
  if (input.endsOn !== undefined && input.endsOn !== null && input.endsOn !== '') {
    if (!isIsoDate(input.endsOn)) return { error: 'recurrence.endsOn must be a date (YYYY-MM-DD)' };
    if (input.endsOn < startsOn) return { error: 'recurrence.endsOn cannot be before startsOn' };
    endsOn = input.endsOn;
  }

  const timeOfDay = input.timeOfDay === undefined || input.timeOfDay === null || input.timeOfDay === '' ? '09:00' : input.timeOfDay;
  if (typeof timeOfDay !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay)) {
    return { error: 'recurrence.timeOfDay must be HH:MM (24-hour)' };
  }

  const timezone = input.timezone === undefined || input.timezone === null || input.timezone === '' ? DEFAULT_TIMEZONE : input.timezone;
  if (!isValidTimeZone(timezone)) return { error: 'recurrence.timezone is not a known time zone' };

  let weekdays: number[] = [];
  if (f === 'weekly') {
    const raw = input.weekdays === undefined || input.weekdays === null ? [weekdayOf(startsOn)] : input.weekdays;
    if (!Array.isArray(raw) || raw.length === 0) return { error: 'recurrence.weekdays must list at least one day for a weekly rule' };
    if (!raw.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return { error: 'recurrence.weekdays must be days 0 (Sunday) to 6 (Saturday)' };
    }
    weekdays = [...new Set(raw as number[])].sort((a, b) => a - b);
  }

  let monthDay: number | null = null;
  if (f === 'monthly') {
    const raw = input.monthDay === undefined || input.monthDay === null ? ymd(startsOn)[2] : Number(input.monthDay);
    if (!Number.isInteger(raw) || raw < 1 || raw > 31) return { error: 'recurrence.monthDay must be a day from 1 to 31' };
    monthDay = raw;
  }

  return { rule: { frequency: f, interval, weekdays, monthDay, timeOfDay, timezone, startsOn, endsOn } };
}

/* ── Occurrences ──────────────────────────────────────────────────────────── */

function at(rule: Rule, date: string): number {
  const [h, m] = hm(rule.timeOfDay);
  return localToUtc(date, h, m, rule.timezone);
}

function withinEnd(rule: Rule, ms: number): boolean {
  return rule.endsOn === null || localDate(ms, rule.timezone) <= rule.endsOn;
}

/** The first occurrence at or after `after` (UTC ms), or null when the rule has ended. */
export function nextOccurrence(rule: Rule, after: number): number | null {
  const found = rawNext(rule, after);
  return found !== null && withinEnd(rule, found) ? found : null;
}

function rawNext(rule: Rule, after: number): number | null {
  const first = at(rule, rule.startsOn);

  if (rule.frequency === 'hourly') {
    if (after <= first) return first;
    const step = rule.interval * HOUR_MS;
    return first + Math.ceil((after - first) / step) * step;
  }

  // The local date to start looking from, never before the rule begins.
  let from = localDate(Math.max(after, first), rule.timezone);
  if (from < rule.startsOn) from = rule.startsOn;

  if (rule.frequency === 'daily') {
    const k = Math.ceil(daysBetween(rule.startsOn, from) / rule.interval);
    for (let i = k; i <= k + 2; i++) {
      const ms = at(rule, addDays(rule.startsOn, i * rule.interval));
      if (ms >= after) return ms;
    }
    return null;
  }

  if (rule.frequency === 'weekly') {
    // Weeks run Monday to Sunday, counted from the week the rule starts in, and
    // only every `interval`th of them is live.
    const weekStart = addDays(rule.startsOn, -((weekdayOf(rule.startsOn) + 6) % 7));
    const horizon = 7 * rule.interval + 7;
    for (let i = 0; i <= horizon; i++) {
      const d = addDays(from, i);
      if (d < rule.startsOn) continue;
      if (!rule.weekdays.includes(weekdayOf(d))) continue;
      const week = Math.floor(daysBetween(weekStart, d) / 7);
      if (week % rule.interval !== 0) continue;
      const ms = at(rule, d);
      if (ms >= after) return ms;
    }
    return null;
  }

  // Monthly.
  const [sy, sm] = ymd(rule.startsOn);
  const [fy, fm] = ymd(from);
  const monthsSince = (fy - sy) * 12 + (fm - sm);
  const k = Math.max(0, Math.floor(monthsSince / rule.interval));
  for (let i = k; i <= k + 3; i++) {
    const total = sm - 1 + i * rule.interval;
    const d = clampedMonthDate(sy + Math.floor(total / 12), (total % 12) + 1, rule.monthDay!);
    if (d < rule.startsOn) continue;
    const ms = at(rule, d);
    if (ms >= after) return ms;
  }
  return null;
}

/** Occurrences in [from, to), at most `limit`. */
export function occurrencesBetween(rule: Rule, from: number, to: number, limit = 500): number[] {
  const out: number[] = [];
  let t = nextOccurrence(rule, from);
  while (t !== null && t < to && out.length < limit) {
    out.push(t);
    t = nextOccurrence(rule, t + 1);
  }
  return out;
}

/** The nominal gap between occurrences. Monthly uses 28 days — the shortest it can be. */
export function periodMs(rule: Rule): number {
  switch (rule.frequency) {
    case 'hourly': return rule.interval * HOUR_MS;
    case 'daily': return rule.interval * DAY_MS;
    case 'weekly': return rule.interval * 7 * DAY_MS;
    case 'monthly': return rule.interval * 28 * DAY_MS;
  }
}

/**
 * The longest two consecutive occurrences can be apart: a month can be 31 days,
 * and a day 25 hours across a DST change, so both get a day's slack.
 */
function longestGapMs(rule: Rule): number {
  return rule.frequency === 'monthly' ? rule.interval * 31 * DAY_MS + DAY_MS : periodMs(rule) + DAY_MS;
}

/**
 * How far ahead of its time an occurrence becomes a task: one period, never more
 * than a week. So the next one is on the board before it is due — tomorrow's daily
 * task appears today, next week's weekly one this week — without a monthly rule
 * filling the board a month in advance. The calendar projects the rest.
 */
export const MAX_LEAD_MS = 7 * DAY_MS;
export function leadMs(rule: Rule): number {
  return Math.min(periodMs(rule), MAX_LEAD_MS);
}

/**
 * Which occurrences to turn into tasks now, and where the rule resumes.
 *
 * `nextRunAt` is the first occurrence not yet created. Everything due inside the
 * lead window is created. If the rule fell behind — the cron did not run, or a
 * series was created with a start date in the past — only the most recent missed
 * occurrence is created, not every one: a day's outage must not leave twenty-four
 * copies of an hourly task on somebody's board.
 */
export function plan(rule: Rule, nextRunAt: number | null, now: number): { create: number[]; nextRunAt: number | null } {
  if (nextRunAt === null) return { create: [], nextRunAt: null };
  const create: number[] = [];
  let t: number | null = nextRunAt;

  if (t <= now) {
    // The latest occurrence at or before now. It lies within one longest-possible
    // gap of now (or is `t` itself), so only that window is walked, however far
    // behind the rule is.
    let s: number | null = nextOccurrence(rule, Math.max(t, now - longestGapMs(rule)));
    let latest: number | null = null;
    while (s !== null && s <= now) {
      latest = s;
      s = nextOccurrence(rule, s + 1);
    }
    if (latest !== null) create.push(latest);
    t = s;
  }

  const lead = leadMs(rule);
  while (t !== null && t - lead <= now && create.length < 50) {
    create.push(t);
    t = nextOccurrence(rule, t + 1);
  }
  return { create, nextRunAt: t };
}

/* ── Words ────────────────────────────────────────────────────────────────── */

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** "Every 2 weeks on Mon, Wed at 09:00" — what the UI shows for a series. */
export function describeRule(rule: Rule): string {
  const every = (unit: string) => (rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`);
  const until = rule.endsOn ? `, until ${rule.endsOn}` : '';
  switch (rule.frequency) {
    case 'hourly':
      return `${every('hour')} from ${rule.timeOfDay} on ${rule.startsOn}${until}`;
    case 'daily':
      return `${every('day')} at ${rule.timeOfDay}${until}`;
    case 'weekly':
      return `${every('week')} on ${rule.weekdays.map((d) => WEEKDAY_NAMES[d]).join(', ')} at ${rule.timeOfDay}${until}`;
    case 'monthly': {
      const day = rule.monthDay! >= 29 ? `${ordinal(rule.monthDay!)} (or the last day)` : ordinal(rule.monthDay!);
      return `${every('month')} on the ${day} at ${rule.timeOfDay}${until}`;
    }
  }
}
