/**
 * The task form's "Repeat" choice, and the rule it becomes.
 *
 * The rule's MEANING lives on the server (src/tasks/recurrence.ts) and nowhere
 * else: the form shows the server's own description and next dates via
 * `POST /api/tasks/recurrences/preview`, so what a person reads before saving is
 * exactly what the scheduler will do. This file only maps the form to and from
 * the rule's fields.
 */

export type RepeatMode = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type RepeatUnit = 'hours' | 'days' | 'weeks' | 'months';

export interface RepeatState {
	mode: RepeatMode;
	unit: RepeatUnit;
	interval: number;
	/** 0 = Sunday … 6 = Saturday. */
	weekdays: number[];
	monthDay: number;
	timeOfDay: string;
	startsOn: string;
	endsOn: string;
}

export interface RuleInput {
	frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
	interval: number;
	weekdays?: number[];
	monthDay?: number;
	timeOfDay: string;
	timezone: string;
	startsOn: string;
	endsOn: string | null;
}

/** A series as `GET /api/tasks/recurrences/:id` returns it. */
export interface SeriesRow {
	id: string;
	title: string;
	description: string | null;
	priority: string | null;
	department: string;
	taskType: string | null;
	committeeId: string | null;
	appointmentId: string | null;
	assigneeIds: string[];
	frequency: RuleInput['frequency'];
	interval: number;
	weekdays: number[];
	monthDay: number | null;
	timeOfDay: string;
	timezone: string;
	startsOn: string;
	endsOn: string | null;
	nextRunAt: number | null;
	isActive: boolean;
	summary: string;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const UNIT_TO_FREQUENCY: Record<RepeatUnit, RuleInput['frequency']> = {
	hours: 'hourly',
	days: 'daily',
	weeks: 'weekly',
	months: 'monthly',
};
const FREQUENCY_TO_UNIT: Record<RuleInput['frequency'], RepeatUnit> = {
	hourly: 'hours',
	daily: 'days',
	weekly: 'weeks',
	monthly: 'months',
};

/** Today in the browser's own zone, as YYYY-MM-DD. */
export function localToday(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function browserTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi';
	} catch {
		return 'Asia/Karachi';
	}
}

/** Weekday and day of month of a YYYY-MM-DD, without a zone getting involved. */
export function weekdayOf(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function dayOf(date: string): number {
	return Number(date.split('-')[2]);
}

export function ordinal(n: number): string {
	const teen = n % 100 >= 11 && n % 100 <= 13;
	const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
	return `${n}${suffix}`;
}

export function defaultRepeat(startsOn = localToday()): RepeatState {
	return {
		mode: 'none',
		unit: 'weeks',
		interval: 1,
		weekdays: [weekdayOf(startsOn)],
		monthDay: dayOf(startsOn),
		timeOfDay: '09:00',
		startsOn,
		endsOn: '',
	};
}

/** The rule this state describes, or null for "does not repeat". */
export function toRule(s: RepeatState): RuleInput | null {
	if (s.mode === 'none') return null;
	const base = { timeOfDay: s.timeOfDay || '09:00', timezone: browserTimeZone(), startsOn: s.startsOn, endsOn: s.endsOn || null };
	switch (s.mode) {
		case 'hourly':
			return { ...base, frequency: 'hourly', interval: 1 };
		case 'daily':
			return { ...base, frequency: 'daily', interval: 1 };
		case 'weekly':
			return { ...base, frequency: 'weekly', interval: 1, weekdays: [weekdayOf(s.startsOn)] };
		case 'monthly':
			return { ...base, frequency: 'monthly', interval: 1, monthDay: dayOf(s.startsOn) };
		case 'custom': {
			const frequency = UNIT_TO_FREQUENCY[s.unit];
			return {
				...base,
				frequency,
				interval: Math.max(1, Math.floor(s.interval) || 1),
				...(frequency === 'weekly' ? { weekdays: s.weekdays.length ? s.weekdays : [weekdayOf(s.startsOn)] } : {}),
				...(frequency === 'monthly' ? { monthDay: s.monthDay } : {}),
			};
		}
	}
}

/** A saved series, back into the form — as a preset when it is one, else custom. */
export function fromSeries(row: Pick<SeriesRow, 'frequency' | 'interval' | 'weekdays' | 'monthDay' | 'timeOfDay' | 'startsOn' | 'endsOn'>): RepeatState {
	const s: RepeatState = {
		mode: 'custom',
		unit: FREQUENCY_TO_UNIT[row.frequency],
		interval: row.interval,
		weekdays: row.weekdays.length ? row.weekdays : [weekdayOf(row.startsOn)],
		monthDay: row.monthDay ?? dayOf(row.startsOn),
		timeOfDay: row.timeOfDay,
		startsOn: row.startsOn,
		endsOn: row.endsOn ?? '',
	};
	if (row.interval === 1) {
		if (row.frequency === 'hourly' || row.frequency === 'daily') s.mode = row.frequency;
		if (row.frequency === 'weekly' && row.weekdays.length === 1 && row.weekdays[0] === weekdayOf(row.startsOn)) s.mode = 'weekly';
		if (row.frequency === 'monthly' && row.monthDay === dayOf(row.startsOn)) s.mode = 'monthly';
	}
	return s;
}
