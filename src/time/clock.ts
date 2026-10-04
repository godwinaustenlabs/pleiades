/**
 * Local dates and hours for time logging, from UTC epoch milliseconds.
 *
 * Pure, and built only on `Intl.DateTimeFormat`, which workerd ships with full ICU
 * data — so a date in `America/New_York` is computed the same way here as in a
 * browser, DST included. Nothing in this file reads a clock.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** The default zone for a new employee; the company is in Pakistan. */
export const DEFAULT_TIMEZONE = 'Asia/Karachi';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** True for an IANA name the runtime knows. The constructor throws on anything else. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function parts(ms: number, tz: string): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  // `hourCycle: 'h23'` should never yield 24, but some ICU builds have; midnight is 0.
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of `ms` in `tz`. */
export function localDate(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 0–23, the local hour `ms` falls in. */
export function localHour(ms: number, tz: string): number {
  return parts(ms, tz).hour;
}

/** True for a well-formed YYYY-MM-DD that names a real calendar date. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Offset of `tz` from UTC at instant `ms`, in milliseconds (positive east of Greenwich). */
function offsetAt(ms: number, tz: string): number {
  const p = parts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The UTC instant of a local wall-clock time on a local date.
 *
 * Two passes, because the offset to subtract depends on the instant being computed
 * — it only differs from one pass across a DST change. A wall time that does not
 * exist (inside a spring-forward gap) resolves to the instant just after the gap.
 */
export function localToUtc(date: string, hour: number, minute = 0, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, minute);
  let guess = naive - offsetAt(naive, tz);
  guess = naive - offsetAt(guess, tz);
  return guess;
}

/** First and last instant of a local date, as [start, end). */
export function localDayBounds(date: string, tz: string): [number, number] {
  const start = localToUtc(date, 0, 0, tz);
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return [start, localToUtc(next, 0, 0, tz)];
}

export type Interval = {
  kind: string;
  startedAt: number;
  endedAt: number | null;
  timeUnknown?: boolean | number | null;
};

export type HourBucket = { hour: number; workMs: number; pauseMs: number };

/**
 * The 24 local hours of one day, with how much work and pause fell in each.
 *
 * `now` closes a running interval for display. Duration-only entries are skipped:
 * their clock position is a placeholder, and putting two hours at noon would invent
 * exactly the precision those entries exist to avoid.
 */
export function hourProfile(entries: Interval[], tz: string, now: number): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, workMs: 0, pauseMs: 0 }));
  for (const e of entries) {
    if (e.timeUnknown) continue;
    const end = e.endedAt ?? now;
    let t = e.startedAt;
    // Walk hour boundaries in UTC. Every zone in use is offset by whole quarter
    // hours, so stepping to the next UTC hour can overshoot a local boundary by up
    // to 45 minutes; step to the next quarter hour instead and attribute each slice
    // to the local hour it starts in.
    while (t < end) {
      const nextQuarter = Math.floor(t / 900_000) * 900_000 + 900_000;
      const sliceEnd = Math.min(end, nextQuarter);
      const b = buckets[localHour(t, tz)];
      if (e.kind === 'work') b.workMs += sliceEnd - t;
      else b.pauseMs += sliceEnd - t;
      t = sliceEnd;
    }
  }
  return buckets;
}

/** Closed (or, given `now`, running) length of an interval. */
export function lengthOf(e: Interval, now?: number): number {
  const end = e.endedAt ?? now;
  return end == null ? 0 : Math.max(0, end - e.startedAt);
}
