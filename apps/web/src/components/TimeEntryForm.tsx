import { useState } from 'react';
import { X } from 'lucide-react';
import {
  type LoggableTask, type TimeEntry,
  dateIn, toLocalInput, fromLocalInput,
} from '../lib/time';

/**
 * Add or change one stretch of logged time.
 *
 * Two ways to say it, because forgotten time is usually remembered as "about two
 * hours on Tuesday", not "10:05 to 12:10". The duration form stores no clock times
 * at all rather than invent them — such an entry counts in every total and simply
 * stays out of the hour-by-hour view.
 *
 * `requireReason` is for somebody changing another person's time (a department
 * head or HR): those changes must say why, and the reason goes in the audit log.
 */
export interface TimeEntryFormProps {
  title: string;
  timezone: string;
  entry?: TimeEntry;
  /** Null hides the task picker (a head adding time for somebody keeps it general). */
  tasks: LoggableTask[] | null;
  defaultDate?: string;
  defaultTaskId?: string | null;
  requireReason?: boolean;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

const inputCls = 'w-full bg-surfaceAlt border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary';
const labelCls = 'block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-1.5';

export default function TimeEntryForm({
  title, timezone, entry, tasks, defaultDate, defaultTaskId, requireReason, onSubmit, onClose,
}: TimeEntryFormProps) {
  const now = Date.now();
  const initialDuration = entry ? Math.round(((entry.endedAt ?? now) - entry.startedAt) / 60_000) : 60;
  const [mode, setMode] = useState<'duration' | 'times'>(entry && !entry.timeUnknown ? 'times' : 'duration');
  const [date, setDate] = useState(entry ? dateIn(entry.startedAt, timezone) : defaultDate || dateIn(now, timezone));
  const [hours, setHours] = useState(String(Math.floor(initialDuration / 60)));
  const [minutes, setMinutes] = useState(String(initialDuration % 60));
  const [start, setStart] = useState(toLocalInput(entry?.startedAt ?? now - 3_600_000, timezone));
  const [end, setEnd] = useState(toLocalInput(entry?.endedAt ?? now, timezone));
  const [taskId, setTaskId] = useState<string>(entry ? entry.taskId ?? '' : defaultTaskId ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPause = entry?.kind === 'pause';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = {};
    if (mode === 'duration') {
      const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
      if (total < 1) { setError('Enter how long you worked'); return; }
      body.date = date;
      body.minutes = total;
    } else {
      body.startedAt = fromLocalInput(start, timezone);
      body.endedAt = fromLocalInput(end, timezone);
    }
    if (tasks && !isPause) body.taskId = taskId || null;
    if (note !== (entry?.note ?? '')) body.note = note || null;
    if (requireReason) body.reason = reason;
    setSaving(true);
    try {
      await onSubmit(body);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 scrim animate-in fade-in">
      <div className="sheet bg-surface border border-white/10 rounded-3xl w-full max-w-lg max-h-[90dvh] overflow-y-auto custom-scrollbar shadow-2xl animate-in zoom-in-95">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-bold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
            {(['duration', 'times'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? 'bg-primary text-surface' : 'text-textSecondary hover:text-white'}`}
              >
                {m === 'duration' ? 'How long' : 'Start and end'}
              </button>
            ))}
          </div>

          {mode === 'duration' ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" required value={date} max={dateIn(now, timezone)} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Hours</label>
                <input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Minutes</label>
                <input type="number" min={0} max={59} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputCls} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start</label>
                <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>End</label>
                <input type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}
          <p className="text-[11px] text-textSecondary -mt-1">Times are in {timezone.replace('_', ' ')}.</p>

          {tasks && !isPause && (
            <div>
              <label className={labelCls}>Task</label>
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={inputCls}>
                <option value="">General work</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Note (optional)</label>
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What you worked on" className={inputCls} />
          </div>

          {requireReason && (
            <div>
              <label className={labelCls}>Why is this being changed?</label>
              <input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit log" className={inputCls} />
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-textSecondary">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-primary text-surface font-bold rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
