import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2, Clock } from 'lucide-react';
import TimeEntryForm from './TimeEntryForm';
import {
  type DayDetail, type DaySummary, type LoggableTask, type TimeEntry,
  timeApi, formatDuration, formatClock, formatDate, dateIn,
} from '../lib/time';

/**
 * Logged time, day by day: one person's own ("My time"), or — for their manager,
 * department head or HR — somebody else's (the employee profile's Time tab).
 *
 * Own time is editable for 14 days without asking anyone; every edit stays
 * visible ("edited — originally 10:02–13:40") instead of being approved. Older
 * entries, and anybody else's, are changed by a department head or HR, with a
 * reason that goes in the audit log.
 *
 * Nothing here compares people or counts against a target. There isn't one.
 */
const SELF_WINDOW_MS = 14 * 24 * 3_600_000;

export default function TimeLog({ employeeId }: {
  /** Omit for the signed-in person's own time. */
  employeeId?: string;
}) {
  const self = !employeeId;
  const base = self ? '/dashboard/time' : `/time/people/${employeeId}`;
  const [range, setRange] = useState(30);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [timezone, setTimezone] = useState('Asia/Karachi');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [tasks, setTasks] = useState<LoggableTask[] | null>(null);
  const [form, setForm] = useState<{ entry?: TimeEntry; date?: string } | null>(null);
  // For somebody else's time: whether the caller is their department head or HR,
  // and so may change any closed entry (with a reason). The server says.
  const [canEditOld, setCanEditOld] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - (range - 1) * 86_400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const r = await timeApi<{ timezone: string; days: DaySummary[]; canEdit?: boolean } | null>('GET', `${base}/days?from=${iso(from)}&to=${iso(to)}`);
      setTimezone(r?.timezone || 'Asia/Karachi');
      setCanEditOld(!self && !!r?.canEdit);
      setDays(r?.days || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load time');
    } finally {
      setLoading(false);
    }
  }, [base, range, self]);

  const loadDay = useCallback(async (date: string) => {
    setDetail(await timeApi<DayDetail | null>('GET', `${base}/days/${date}`));
  }, [base]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (self) timeApi<LoggableTask[] | null>('GET', '/dashboard/time/tasks').then((t) => setTasks(t || [])).catch(() => setTasks([]));
  }, [self]);
  useEffect(() => {
    if (open) loadDay(open).catch(() => setDetail(null));
    else setDetail(null);
  }, [open, loadDay]);

  const reloadAll = async () => {
    await load();
    if (open) await loadDay(open);
  };

  const canEdit = (e: TimeEntry) =>
    e.endedAt != null && (canEditOld || (self && e.startedAt >= Date.now() - SELF_WINDOW_MS));

  const save = async (body: Record<string, unknown>) => {
    if (form?.entry) {
      await timeApi('PATCH', self ? `/dashboard/time/entries/${form.entry.id}` : `/time/entries/${form.entry.id}`, body);
    } else {
      await timeApi('POST', `${base}/entries`, body);
    }
    await reloadAll();
  };

  const remove = async (e: TimeEntry) => {
    let path = self ? `/dashboard/time/entries/${e.id}` : `/time/entries/${e.id}`;
    if (!self) {
      const reason = prompt('Why is this being removed? (recorded in the audit log)');
      if (!reason) return;
      path += `?reason=${encodeURIComponent(reason)}`;
    } else if (!confirm('Remove this entry?')) {
      return;
    }
    try {
      await timeApi('DELETE', path);
      await reloadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not remove');
    }
  };

  const total = days.reduce((s, d) => s + d.loggedMs, 0);
  const maxDay = Math.max(1, ...days.map((d) => d.loggedMs));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-textSecondary">Last {range} days</p>
          <p className="text-2xl font-black text-white font-mono">{formatDuration(total)}</p>
          <p className="text-xs text-textSecondary">{days.length} day{days.length === 1 ? '' : 's'} with time logged · {timezone.replace('_', ' ')}</p>
        </div>
        {(self || canEditOld) && (
          <button onClick={() => setForm({})} className="px-4 py-2 bg-primary text-surface font-bold rounded-xl text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add time
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && days.length === 0 && <p className="text-sm text-textSecondary">Loading…</p>}
      {!loading && days.length === 0 && !error && (
        <div className="p-8 text-center text-textSecondary border border-dashed border-white/10 rounded-2xl text-sm">
          No time logged in this period.
        </div>
      )}

      <div className="space-y-2">
        {days.map((d) => (
          <div key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <button
              onClick={() => setOpen(open === d.workDate ? null : d.workDate)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
            >
              {open === d.workDate ? <ChevronDown className="w-4 h-4 text-textSecondary" /> : <ChevronRight className="w-4 h-4 text-textSecondary" />}
              <span className="w-28 shrink-0 text-sm font-bold">{formatDate(d.workDate)}</span>
              <span className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <span className="block h-full bg-primary/70 rounded-full" style={{ width: `${(d.loggedMs / maxDay) * 100}%` }} />
              </span>
              <span className="w-20 shrink-0 text-right text-sm font-mono">{formatDuration(d.loggedMs)}</span>
              <span className="hidden sm:flex w-40 shrink-0 justify-end gap-1">
                {d.running && <Tag tone="primary">running</Tag>}
                {d.changedCount > 0 && <Tag>edited</Tag>}
                {d.autoClosedCount > 0 && <Tag tone="warning">auto-closed</Tag>}
              </span>
            </button>
            {open === d.workDate && detail && detail.day.id === d.id && (
              <DayView detail={detail} canEdit={canEdit} onEdit={(entry) => setForm({ entry })} onRemove={remove} />
            )}
          </div>
        ))}
      </div>

      <button onClick={() => setRange(range + 30)} className="text-xs font-bold text-textSecondary hover:text-white">Show 30 more days</button>

      {form && (
        <TimeEntryForm
          title={form.entry ? 'Change entry' : 'Add time'}
          timezone={form.entry ? (detail?.day.timezone ?? timezone) : timezone}
          entry={form.entry}
          tasks={self ? tasks : null}
          defaultDate={form.date}
          requireReason={!self}
          onSubmit={save}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function DayView({ detail, canEdit, onEdit, onRemove }: {
  detail: DayDetail;
  canEdit: (e: TimeEntry) => boolean;
  onEdit: (e: TimeEntry) => void;
  onRemove: (e: TimeEntry) => void;
}) {
  const tz = detail.day.timezone;
  const peak = Math.max(1, ...detail.hours.map((h) => h.workMs + h.pauseMs));
  return (
    <div className="px-4 pb-4 space-y-4 border-t border-white/5">
      {/* Hour by hour, in the day's own zone. Duration-only entries are not placed here. */}
      <div className="pt-4">
        <div className="flex items-end gap-[2px] h-16" role="img" aria-label="Time logged by hour of the day">
          {detail.hours.map((h) => (
            <div key={h.hour} className="flex-1 flex flex-col justify-end h-full" title={`${String(h.hour).padStart(2, '0')}:00 — ${formatDuration(h.workMs)} work${h.pauseMs ? `, ${formatDuration(h.pauseMs)} paused` : ''}`}>
              <div className="bg-white/15 rounded-t-sm" style={{ height: `${(h.pauseMs / peak) * 100}%` }} />
              <div className="bg-primary/80" style={{ height: `${(h.workMs / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-textSecondary font-mono mt-1">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>

      {detail.byTask.length > 0 && (
        <div className="space-y-1">
          {detail.byTask.map((t) => (
            <div key={t.taskId ?? 'general'} className="flex justify-between text-sm">
              <span className={t.taskId ? 'text-white truncate' : 'text-textSecondary italic'}>{t.title ?? 'General work'}</span>
              <span className="font-mono text-textSecondary shrink-0 ml-3">{formatDuration(t.ms)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="divide-y divide-white/5 rounded-xl border border-white/5">
        {detail.entries.map((e) => (
          <div key={e.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${e.kind === 'pause' ? 'opacity-60' : ''}`}>
            <Clock className="w-3.5 h-3.5 text-textSecondary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate">
                <span className="font-mono">
                  {e.timeUnknown
                    ? `${formatDuration((e.endedAt ?? e.startedAt) - e.startedAt)}, no clock times`
                    : `${formatClock(e.startedAt, tz)}–${e.endedAt ? formatClock(e.endedAt, tz) : 'now'}`}
                </span>
                <span className="text-textSecondary"> · {e.kind === 'pause' ? 'Paused' : e.taskTitle ?? 'General work'}</span>
              </p>
              <p className="text-[11px] text-textSecondary">
                {[
                  e.note,
                  e.source === 'manual' ? 'added afterwards' : null,
                  e.source === 'legacy' ? 'from the old attendance record' : null,
                  e.autoClosed ? 'closed automatically' : null,
                  e.editedAt && e.originalStartedAt != null && e.originalEndedAt != null
                    ? `edited — originally ${formatClock(e.originalStartedAt, tz)}–${formatClock(e.originalEndedAt, tz)}`
                    : e.editedAt ? 'edited' : null,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            {canEdit(e) && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => onEdit(e)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Change"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => onRemove(e)} className="p-1.5 rounded-lg hover:bg-white/10 text-danger" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-textSecondary">Times in {tz.replace('_', ' ')} · {formatDate(dateIn(Date.now(), tz)) === formatDate(detail.day.workDate) ? 'today' : formatDate(detail.day.workDate)}</p>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'primary' | 'warning' }) {
  const cls = tone === 'primary' ? 'text-primary border-primary/30' : tone === 'warning' ? 'text-warning border-warning/30' : 'text-textSecondary border-white/10';
  return <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${cls}`}>{children}</span>;
}
