import { useCallback, useEffect, useState } from 'react';
import { API, authHeaders } from './auth';

/**
 * Client half of time logging. The server is the clock: every instant here came
 * from it, and the running display is `serverNow - startedAt` plus however long
 * ago that answer arrived — never a parse of a wall-clock string in the browser's
 * own zone, which is how the old attendance widget ran five hours off in Karachi.
 *
 * Wording matters and is kept here: start, pause, done for now. Pay is per task and
 * nobody owes hours, so there is no clock-in, no shift and no "late".
 */

export type TimerState = 'idle' | 'working' | 'paused';

export interface TimeEntry {
	id: string;
	dayId: string;
	employeeId: string;
	kind: 'work' | 'pause';
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
}

export interface TimeStateResponse {
	state: TimerState;
	openEntry: TimeEntry | null;
	timezone: string;
	today: { date: string; loggedMs: number; pausedMs: number };
	lastTaskId: string | null;
	serverNow: number;
	autoClosed: TimeEntry[];
}

export interface LoggableTask {
	id: string;
	title: string;
	status: string;
	department: string;
}

export interface DaySummary {
	id: string;
	workDate: string;
	timezone: string;
	loggedMs: number;
	pausedMs: number;
	entryCount: number;
	changedCount: number;
	autoClosedCount: number;
	running: boolean;
}

export interface DayDetail {
	day: DaySummary;
	entries: TimeEntry[];
	hours: { hour: number; workMs: number; pauseMs: number }[];
	byTask: { taskId: string | null; title: string | null; ms: number }[];
}

export interface TaskTime {
	totalMs: number;
	runningNow: number;
	contributors: { employeeId: string; name: string; ms: number; share: number }[] | null;
	contributorCount?: number;
	durationOnlyMs?: number;
	changedMs?: number;
	autoClosedMs?: number;
}

/** Thrown with the server's message, and — on a 409 — the state it now holds. */
export class TimeApiError extends Error {
	status: number;
	data?: unknown;
	constructor(message: string, status: number, data?: unknown) {
		super(message);
		this.status = status;
		this.data = data;
	}
}

export async function timeApi<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: { ...authHeaders(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new TimeApiError(json?.error || `Request failed (${res.status})`, res.status, json?.data);
	return json.data as T;
}

/** "3 h 20 m", "45 m", "0 m". */
export function formatDuration(ms: number): string {
	const mins = Math.max(0, Math.floor(ms / 60_000));
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** "3.5 h", for tables and CSV. */
export function formatHours(ms: number): string {
	return `${(ms / 3_600_000).toFixed(ms >= 36_000_000 ? 0 : 1)} h`;
}

/** "14:05" in the day's own zone, so an entry reads the way it was worked. */
export function formatClock(ms: number, timeZone: string): string {
	return new Intl.DateTimeFormat(undefined, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}

/** "Tue 9 Sep" for a YYYY-MM-DD, read as a calendar date with no zone shift. */
export function formatDate(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

/** YYYY-MM-DD of an instant in a zone. */
export function dateIn(ms: number, timeZone: string): string {
	const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
	return p.slice(0, 10);
}

/** The value for an `<input type="datetime-local">` showing `ms` in `timeZone`. */
export function toLocalInput(ms: number, timeZone: string): string {
	const f = new Intl.DateTimeFormat('en-CA', {
		timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
	}).formatToParts(ms);
	const g = (t: string) => f.find((p) => p.type === t)?.value ?? '00';
	return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

/**
 * The inverse: an `<input type="datetime-local">` value, meant in `timeZone`, as an
 * instant. Two passes over the zone offset so a DST boundary resolves correctly.
 */
export function fromLocalInput(value: string, timeZone: string): number {
	const [date, clock] = value.split('T');
	const [y, mo, d] = date.split('-').map(Number);
	const [h, mi] = (clock || '00:00').split(':').map(Number);
	const naive = Date.UTC(y, mo - 1, d, h, mi);
	const offset = (ms: number) => {
		const p = new Intl.DateTimeFormat('en-US', {
			timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
		}).formatToParts(ms);
		const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
		return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second')) - Math.floor(ms / 1000) * 1000;
	};
	let guess = naive - offset(naive);
	guess = naive - offset(guess);
	return guess;
}

/**
 * The signed-in person's timer. Re-reads on focus and when the tab becomes visible,
 * so a phone and a laptop agree; ticks once a second while something runs.
 * `null` state means this login has no employee record and the widget should hide.
 */
export function useTimer() {
	const [state, setState] = useState<TimeStateResponse | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	// Difference between the server's clock and this browser's, from the last answer.
	const [skew, setSkew] = useState(0);

	const apply = useCallback((s: TimeStateResponse | null) => {
		if (s) setSkew(s.serverNow - Date.now());
		setState(s);
		setLoaded(true);
	}, []);

	const refresh = useCallback(async () => {
		try {
			apply(await timeApi<TimeStateResponse | null>('GET', '/dashboard/time/state'));
		} catch {
			setLoaded(true);
		}
	}, [apply]);

	useEffect(() => {
		refresh();
		const onFocus = () => refresh();
		const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [refresh]);

	useEffect(() => {
		if (!state?.openEntry) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [state?.openEntry]);

	const act = useCallback(async (action: 'start' | 'pause' | 'resume' | 'switch' | 'done', body?: { taskId?: string | null }) => {
		setBusy(true);
		setError(null);
		try {
			apply(await timeApi<TimeStateResponse>('POST', `/dashboard/time/${action}`, body ?? {}));
		} catch (err) {
			// A conflict means another window moved first; its answer carries the truth.
			if (err instanceof TimeApiError && err.status === 409 && err.data) apply(err.data as TimeStateResponse);
			setError(err instanceof Error ? err.message : 'Something went wrong');
		} finally {
			setBusy(false);
		}
	}, [apply]);

	const serverNow = now + skew;
	const runningMs = state?.openEntry ? Math.max(0, serverNow - state.openEntry.startedAt) : 0;
	// Today's totals came with the state; add what has run since that answer arrived.
	const sinceAnswer = state ? Math.max(0, serverNow - state.serverNow) : 0;
	const loggedTodayMs = state ? state.today.loggedMs + (state.state === 'working' ? sinceAnswer : 0) : 0;

	return { state, loaded, busy, error, refresh, act, runningMs, loggedTodayMs };
}

/** Days dismissed from the "nothing logged" prompt. A per-browser nicety, not a record. */
export function dismissedMissed(): Set<string> {
	try {
		return new Set(JSON.parse(localStorage.getItem('ga_time_missed_dismissed') || '[]'));
	} catch {
		return new Set();
	}
}

export function dismissMissed(date: string): void {
	try {
		const s = dismissedMissed();
		s.add(date);
		localStorage.setItem('ga_time_missed_dismissed', JSON.stringify([...s].slice(-60)));
	} catch {
		/* storage unavailable: the prompt simply comes back */
	}
}
