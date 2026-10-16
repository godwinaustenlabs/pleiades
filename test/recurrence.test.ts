import { describe, it, expect } from 'vitest';
import {
  parseRule, nextOccurrence, occurrencesBetween, plan, describeRule, leadMs, type Rule, type RuleInput,
} from '../src/tasks/recurrence';
import { localDate, HOUR_MS, DAY_MS } from '../src/time/clock';

/**
 * The repeating-task rule engine. Every case here is one a person would notice
 * on their board: a task on the wrong day, a month skipped, an hour lost to DST,
 * or a flood of copies after a quiet weekend.
 */

function rule(input: RuleInput): Rule {
  const r = parseRule(input);
  if ('error' in r) throw new Error(r.error);
  return r.rule;
}

const utc = (s: string) => Date.parse(s.endsWith('Z') ? s : `${s}Z`);
/** Local dates (and HH:MM when asked) of the first `n` occurrences from `from`. */
function dates(r: Rule, from: number, n: number, withTime = false): string[] {
  return occurrencesBetween(r, from, from + 4000 * DAY_MS, n).map((ms) => {
    const d = localDate(ms, r.timezone);
    if (!withTime) return d;
    const t = new Intl.DateTimeFormat('en-GB', { timeZone: r.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
    return `${d} ${t}`;
  });
}

describe('parseRule', () => {
  const base = { startsOn: '2026-10-19', timezone: 'Asia/Karachi' };

  it('fills presets from the start date', () => {
    expect(rule({ ...base, frequency: 'weekly' }).weekdays).toEqual([1]); // 2026-10-19 is a Monday
    expect(rule({ ...base, frequency: 'monthly' }).monthDay).toBe(19);
    expect(rule({ ...base, frequency: 'daily' })).toMatchObject({ interval: 1, timeOfDay: '09:00' });
  });

  it('refuses what is not a rule', () => {
    const bad: RuleInput[] = [
      { ...base, frequency: 'yearly' },
      { ...base, frequency: 'daily', interval: 0 },
      { ...base, frequency: 'daily', interval: 1.5 },
      { ...base, frequency: 'weekly', interval: 53 },
      { ...base, frequency: 'weekly', weekdays: [] },
      { ...base, frequency: 'weekly', weekdays: [7] },
      { ...base, frequency: 'monthly', monthDay: 32 },
      { ...base, frequency: 'monthly', monthDay: 0 },
      { ...base, frequency: 'daily', timeOfDay: '24:00' },
      { ...base, frequency: 'daily', timeOfDay: '9am' },
      { ...base, frequency: 'daily', timezone: 'Mars/Olympus' },
      { frequency: 'daily', startsOn: '2026-02-30' },
      { ...base, frequency: 'daily', endsOn: '2026-10-18' },
    ];
    for (const b of bad) expect(parseRule(b)).toHaveProperty('error');
  });

  it('sorts and de-duplicates weekdays', () => {
    expect(rule({ ...base, frequency: 'weekly', weekdays: [5, 1, 3, 1] }).weekdays).toEqual([1, 3, 5]);
  });
});

describe('monthly — the day is clamped per month, never carried', () => {
  const r31 = rule({ frequency: 'monthly', monthDay: 31, startsOn: '2027-01-01', timezone: 'UTC' });

  it('the 31st falls on the last day of shorter months and returns to the 31st', () => {
    expect(dates(r31, utc('2027-01-01T00:00'), 7)).toEqual([
      '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31',
    ]);
  });

  it('the 29th of February in a leap year, the 28th otherwise', () => {
    const r29 = rule({ frequency: 'monthly', monthDay: 29, startsOn: '2027-12-01', timezone: 'UTC' });
    expect(dates(r29, utc('2027-12-01T00:00'), 4)).toEqual(['2027-12-29', '2028-01-29', '2028-02-29', '2028-03-29']);
    const r30 = rule({ frequency: 'monthly', monthDay: 30, startsOn: '2026-12-01', timezone: 'UTC' });
    expect(dates(r30, utc('2026-12-01T00:00'), 4)).toEqual(['2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30']);
  });

  it('every 3 months, starting in a month after the day has passed', () => {
    const r = rule({ frequency: 'monthly', interval: 3, monthDay: 15, startsOn: '2026-10-20', timezone: 'UTC' });
    // October's 15th is before the start, so the first is January.
    expect(dates(r, utc('2026-10-20T00:00'), 3)).toEqual(['2027-01-15', '2027-04-15', '2027-07-15']);
  });

  it('crosses a year boundary', () => {
    const r = rule({ frequency: 'monthly', monthDay: 5, startsOn: '2026-11-01', timezone: 'UTC' });
    expect(dates(r, utc('2026-11-01T00:00'), 3)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05']);
  });
});

describe('weekly', () => {
  it('every Monday, Wednesday and Friday', () => {
    const r = rule({ frequency: 'weekly', weekdays: [1, 3, 5], startsOn: '2026-10-19', timezone: 'Asia/Karachi' });
    expect(dates(r, utc('2026-10-19T00:00'), 6)).toEqual([
      '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30',
    ]);
  });

  it('every other week counts weeks from the week the rule starts in', () => {
    // Starts on a Wednesday; Monday of that week has passed, so its first Monday is
    // two weeks on — the next live week — not the one immediately after.
    const r = rule({ frequency: 'weekly', interval: 2, weekdays: [1, 3], startsOn: '2026-10-21', timezone: 'UTC' });
    expect(dates(r, utc('2026-10-21T00:00'), 5)).toEqual(['2026-10-21', '2026-11-02', '2026-11-04', '2026-11-16', '2026-11-18']);
  });

  it('a Sunday-only rule (Sunday ends the Monday-first week)', () => {
    const r = rule({ frequency: 'weekly', interval: 2, weekdays: [0], startsOn: '2026-10-18', timezone: 'UTC' });
    expect(dates(r, utc('2026-10-18T00:00'), 3)).toEqual(['2026-10-18', '2026-11-01', '2026-11-15']);
  });

  it('stays at 09:00 local across a DST change', () => {
    const r = rule({ frequency: 'weekly', weekdays: [1], timeOfDay: '09:00', startsOn: '2026-10-26', timezone: 'America/New_York' });
    // US DST ends Sunday 1 Nov 2026.
    expect(dates(r, utc('2026-10-26T00:00'), 3, true)).toEqual(['2026-10-26 09:00', '2026-11-02 09:00', '2026-11-09 09:00']);
  });
});

describe('daily and hourly', () => {
  it('every 3 days', () => {
    const r = rule({ frequency: 'daily', interval: 3, startsOn: '2026-10-30', timezone: 'UTC' });
    expect(dates(r, utc('2026-10-30T00:00'), 4)).toEqual(['2026-10-30', '2026-11-02', '2026-11-05', '2026-11-08']);
  });

  it('a daily rule asked after today\'s time has passed gives tomorrow', () => {
    const r = rule({ frequency: 'daily', timeOfDay: '09:00', startsOn: '2026-10-01', timezone: 'Asia/Karachi' });
    // 10:00 in Karachi is 05:00 UTC.
    expect(localDate(nextOccurrence(r, utc('2026-10-20T05:00'))!, 'Asia/Karachi')).toBe('2026-10-21');
    expect(localDate(nextOccurrence(r, utc('2026-10-20T03:00'))!, 'Asia/Karachi')).toBe('2026-10-20');
  });

  it('hourly is absolute: two hours of real time, even across DST', () => {
    const r = rule({ frequency: 'hourly', interval: 2, timeOfDay: '00:00', startsOn: '2026-11-01', timezone: 'America/New_York' });
    const occ = occurrencesBetween(r, utc('2026-11-01T00:00'), utc('2026-11-02T00:00'), 5);
    for (let i = 1; i < occ.length; i++) expect(occ[i] - occ[i - 1]).toBe(2 * HOUR_MS);
  });

  it('an occurrence exactly at `after` is included', () => {
    const r = rule({ frequency: 'hourly', timeOfDay: '08:00', startsOn: '2026-10-20', timezone: 'UTC' });
    expect(nextOccurrence(r, utc('2026-10-20T10:00'))).toBe(utc('2026-10-20T10:00'));
  });
});

describe('endsOn', () => {
  it('is inclusive and then the rule is over', () => {
    const r = rule({ frequency: 'daily', startsOn: '2026-10-20', endsOn: '2026-10-22', timezone: 'UTC' });
    expect(dates(r, utc('2026-10-20T00:00'), 10)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(nextOccurrence(r, utc('2026-10-23T00:00'))).toBeNull();
  });
});

describe('plan — what to create, and catching up', () => {
  const daily = rule({ frequency: 'daily', timeOfDay: '09:00', startsOn: '2026-10-01', timezone: 'UTC' });

  it('creates today\'s and, within the lead, tomorrow\'s', () => {
    const now = utc('2026-10-20T09:30');
    const p = plan(daily, utc('2026-10-20T09:00'), now);
    expect(p.create.map((ms) => localDate(ms, 'UTC'))).toEqual(['2026-10-20', '2026-10-21']);
    expect(localDate(p.nextRunAt!, 'UTC')).toBe('2026-10-22');
  });

  it('after a long outage creates only the latest missed occurrence, not every one', () => {
    const hourly = rule({ frequency: 'hourly', timeOfDay: '00:00', startsOn: '2026-01-01', timezone: 'UTC' });
    const now = utc('2026-10-20T10:30');
    const p = plan(hourly, utc('2026-01-01T00:00'), now);
    // 10:00 (missed, latest) and 11:00 (inside the one-hour lead).
    expect(p.create).toEqual([utc('2026-10-20T10:00'), utc('2026-10-20T11:00')]);
    expect(p.nextRunAt).toBe(utc('2026-10-20T12:00'));
  });

  it('a monthly rule on the 31st catches up across a 31-day gap', () => {
    const m = rule({ frequency: 'monthly', monthDay: 31, startsOn: '2026-01-01', timezone: 'UTC' });
    const now = utc('2026-08-20T12:00'); // the latest is 31 Jul, 20 days ago; 31 Aug is outside the lead
    const p = plan(m, utc('2026-01-31T09:00'), now);
    expect(p.create.map((ms) => localDate(ms, 'UTC'))).toEqual(['2026-07-31']);
    expect(localDate(p.nextRunAt!, 'UTC')).toBe('2026-08-31');
    // From 30 Aug, 31 Jul is still the latest missed one and 31 Aug is inside the lead.
    const later = plan(m, utc('2026-01-31T09:00'), utc('2026-08-30T12:00'));
    expect(later.create.map((ms) => localDate(ms, 'UTC'))).toEqual(['2026-07-31', '2026-08-31']);
  });

  it('creates nothing early beyond the lead, and the lead never exceeds a week', () => {
    const m = rule({ frequency: 'monthly', monthDay: 1, startsOn: '2026-10-01', timezone: 'UTC' });
    expect(leadMs(m)).toBe(7 * DAY_MS);
    const p = plan(m, utc('2026-11-01T09:00'), utc('2026-10-20T00:00'));
    expect(p.create).toEqual([]);
    expect(p.nextRunAt).toBe(utc('2026-11-01T09:00'));
  });

  it('is a no-op for a finished rule, and stops at endsOn', () => {
    expect(plan(daily, null, Date.now())).toEqual({ create: [], nextRunAt: null });
    const short = rule({ frequency: 'daily', startsOn: '2026-10-20', endsOn: '2026-10-20', timezone: 'UTC' });
    const p = plan(short, utc('2026-10-20T09:00'), utc('2026-10-20T10:00'));
    expect(p).toEqual({ create: [utc('2026-10-20T09:00')], nextRunAt: null });
  });

  it('running the plan again from where it left off creates nothing new', () => {
    const now = utc('2026-10-20T09:30');
    const first = plan(daily, utc('2026-10-20T09:00'), now);
    const again = plan(daily, first.nextRunAt, now);
    expect(again.create).toEqual([]);
  });
});

describe('describeRule', () => {
  it('reads like a person wrote it', () => {
    expect(describeRule(rule({ frequency: 'weekly', interval: 2, weekdays: [1, 3], startsOn: '2026-10-19', timezone: 'UTC' })))
      .toBe('Every 2 weeks on Mon, Wed at 09:00');
    expect(describeRule(rule({ frequency: 'monthly', monthDay: 31, startsOn: '2026-10-19', timezone: 'UTC' })))
      .toBe('Every month on the 31st (or the last day) at 09:00');
    expect(describeRule(rule({ frequency: 'monthly', monthDay: 2, startsOn: '2026-10-19', timezone: 'UTC' })))
      .toBe('Every month on the 2nd at 09:00');
    expect(describeRule(rule({ frequency: 'daily', startsOn: '2026-10-19', endsOn: '2026-12-31', timezone: 'UTC' })))
      .toBe('Every day at 09:00, until 2026-12-31');
  });
});

/**
 * Brute force: the engine against the dumbest correct implementation.
 *
 * The naive version walks every local date from the start and asks "does the rule
 * fire today?" — no interval arithmetic, no skipping ahead. Any disagreement over
 * random rules, zones and query instants is a bug in the clever version. The seed
 * is fixed and printed, so a failure reproduces.
 */
describe('brute force against a day-by-day enumerator', () => {
  const SEED = 20261016;
  let state = SEED;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const ZONES = ['UTC', 'Asia/Karachi', 'America/New_York', 'Australia/Sydney', 'Europe/London', 'Asia/Kolkata'];

  function firesOn(r: Rule, date: string): boolean {
    const [sy, sm, sd] = r.startsOn.split('-').map(Number);
    const [y, m, d] = date.split('-').map(Number);
    if (date < r.startsOn || (r.endsOn && date > r.endsOn)) return false;
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / DAY_MS);
    if (r.frequency === 'daily') return days % r.interval === 0;
    if (r.frequency === 'weekly') {
      const startDow = new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay();
      const weeks = Math.floor((days + ((startDow + 6) % 7)) / 7);
      return weeks % r.interval === 0 && r.weekdays.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
    }
    const months = (y - sy) * 12 + (m - sm);
    if (months % r.interval !== 0) return false;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d === Math.min(r.monthDay!, last);
  }

  function naiveNext(r: Rule, after: number): number | null {
    let date = r.startsOn;
    for (let i = 0; i < 3000; i++) {
      if (r.endsOn && date > r.endsOn) return null;
      if (firesOn(r, date)) {
        const ms = parseRule({ ...r, frequency: 'daily', interval: 1, startsOn: date, endsOn: null }) as { rule: Rule };
        const t = nextOccurrence(ms.rule, -Infinity)!; // that date at timeOfDay, via the zone conversion only
        if (t >= after) return t;
      }
      const [y, m, d] = date.split('-').map(Number);
      date = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    return null;
  }

  it('agrees on 600 random rules and query instants', () => {
    for (let n = 0; n < 600; n++) {
      const frequency = pick(['daily', 'weekly', 'monthly'] as const);
      const start = `202${6 + Math.floor(rand() * 2)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`;
      const input: RuleInput = {
        frequency,
        interval: 1 + Math.floor(rand() * (frequency === 'daily' ? 10 : frequency === 'weekly' ? 4 : 6)),
        weekdays: frequency === 'weekly' ? [...new Set(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => Math.floor(rand() * 7)))] : undefined,
        monthDay: frequency === 'monthly' ? pick([1, 15, 28, 29, 30, 31] as const) : undefined,
        timeOfDay: pick(['00:00', '01:30', '09:00', '23:45'] as const),
        timezone: pick(ZONES),
        startsOn: start,
        endsOn: rand() < 0.3 ? `2028-0${1 + Math.floor(rand() * 9)}-15` : null,
      };
      const r = rule(input);
      const after = Date.parse(`${start}T00:00:00Z`) + Math.floor(rand() * 500) * DAY_MS + Math.floor(rand() * DAY_MS) - DAY_MS;
      const fast = nextOccurrence(r, after);
      const slow = naiveNext(r, after);
      if (fast !== slow) {
        throw new Error(`seed ${SEED} case ${n}: ${JSON.stringify(r)} after ${new Date(after).toISOString()} → engine ${fast && new Date(fast).toISOString()} vs naive ${slow && new Date(slow).toISOString()}`);
      }
    }
  });
});
