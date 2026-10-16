import { useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { API, token } from '../lib/auth';
import { WEEKDAYS, dayOf, ordinal, toRule, weekdayOf } from '../lib/recurrence';
import type { RepeatState, RepeatMode, RepeatUnit } from '../lib/recurrence';

interface Props {
  value: RepeatState;
  onChange: (next: RepeatState) => void;
  /** False when editing a series, which must repeat. */
  allowNone?: boolean;
  inputCls: string;
  labelCls: string;
}

/**
 * The "Repeat" section of the task form.
 *
 * Presets cover the common cases (every hour, day, week on the start day, month on
 * the start date); Custom adds an interval, a set of weekdays, or a day of the
 * month. Under it sits the server's reading of the rule and its next dates, so a
 * person sees "28 Feb" for "the 31st" before they save rather than after.
 */
export default function RepeatEditor({ value, onChange, allowNone = true, inputCls, labelCls }: Props) {
  const set = (patch: Partial<RepeatState>) => onChange({ ...value, ...patch });
  const [preview, setPreview] = useState<{ summary: string; next: { date: string; occurrenceAt: number }[] } | null>(null);
  const [previewError, setPreviewError] = useState('');

  const rule = toRule(value);
  const ruleKey = JSON.stringify(rule);

  useEffect(() => {
    if (!rule) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/tasks/recurrences/preview`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ recurrence: rule }),
        });
        const d = await res.json();
        if (!res.ok) {
          setPreview(null);
          setPreviewError(d.error || 'This rule is not valid');
        } else {
          setPreview(d.data);
          setPreviewError('');
        }
      } catch {
        // Aborted by a newer edit, or offline; the save itself will validate.
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
    // `ruleKey` is the rule's identity; `rule` itself is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised rule
  }, [ruleKey]);

  const options: { value: RepeatMode; label: string }[] = [
    ...(allowNone ? [{ value: 'none' as const, label: 'Does not repeat' }] : []),
    { value: 'hourly', label: 'Every hour' },
    { value: 'daily', label: 'Every day' },
    { value: 'weekly', label: `Every week on ${WEEKDAYS[weekdayOf(value.startsOn)]}` },
    { value: 'monthly', label: `Every month on the ${ordinal(dayOf(value.startsOn))}` },
    { value: 'custom', label: 'Custom…' },
  ];

  const toggleDay = (d: number) => {
    const has = value.weekdays.includes(d);
    const next = has ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d].sort((a, b) => a - b);
    if (next.length > 0) set({ weekdays: next });
  };

  const repeating = value.mode !== 'none';

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className={`grid grid-cols-1 gap-4 ${repeating ? 'md:grid-cols-2' : ''}`}>
        <div>
          <label className={labelCls}>
            <span className="inline-flex items-center gap-1.5"><Repeat className="h-3 w-3" /> Repeat</span>
          </label>
          <select value={value.mode} onChange={(e) => set({ mode: e.target.value as RepeatMode })} className={inputCls}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {repeating && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Starts on</label>
              <input type="date" required value={value.startsOn} onChange={(e) => e.target.value && set({ startsOn: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{value.mode === 'hourly' || (value.mode === 'custom' && value.unit === 'hours') ? 'From' : 'At'}</label>
              <input type="time" required value={value.timeOfDay} onChange={(e) => e.target.value && set({ timeOfDay: e.target.value })} className={inputCls} />
            </div>
          </div>
        )}
      </div>

      {value.mode === 'custom' && (
        <div className="space-y-4">
          <div className="grid grid-cols-[auto_6rem_1fr] items-center gap-3">
            <span className="text-sm font-bold text-textSecondary">Every</span>
            <input
              type="number" min={1} max={value.unit === 'hours' ? 168 : value.unit === 'days' ? 365 : value.unit === 'weeks' ? 52 : 24}
              value={value.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
              className={inputCls}
              aria-label="Repeat every"
            />
            <select value={value.unit} onChange={(e) => set({ unit: e.target.value as RepeatUnit })} className={inputCls} aria-label="Unit">
              <option value="hours">{value.interval === 1 ? 'hour' : 'hours'}</option>
              <option value="days">{value.interval === 1 ? 'day' : 'days'}</option>
              <option value="weeks">{value.interval === 1 ? 'week' : 'weeks'}</option>
              <option value="months">{value.interval === 1 ? 'month' : 'months'}</option>
            </select>
          </div>

          {value.unit === 'weeks' && (
            <div>
              <label className={labelCls}>On</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Days of the week">
                {WEEKDAYS.map((name, d) => {
                  const on = value.weekdays.includes(d);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d)}
                      className={`h-10 w-12 rounded-xl border text-xs font-black transition-all ${
                        on ? 'border-primary bg-primary text-surface' : 'border-white/10 bg-black/20 text-textSecondary hover:border-white/30'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.unit === 'months' && (
            <div>
              <label className={labelCls}>On day</label>
              <select value={value.monthDay} onChange={(e) => set({ monthDay: Number(e.target.value) })} className={inputCls}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{ordinal(d)}{d >= 29 ? ' (or the last day of shorter months)' : ''}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {repeating && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Ends</label>
            <select value={value.endsOn ? 'on' : 'never'} onChange={(e) => set({ endsOn: e.target.value === 'on' ? value.endsOn || value.startsOn : '' })} className={inputCls}>
              <option value="never">Never</option>
              <option value="on">On a date</option>
            </select>
          </div>
          {value.endsOn && (
            <div>
              <label className={labelCls}>Last date</label>
              <input type="date" min={value.startsOn} value={value.endsOn} onChange={(e) => set({ endsOn: e.target.value })} className={inputCls} />
            </div>
          )}
        </div>
      )}

      {repeating && (
        <div aria-live="polite" className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-xs">
          {previewError ? (
            <p className="font-bold text-danger">{previewError}</p>
          ) : preview ? (
            <>
              <p className="font-bold text-white">{preview.summary}</p>
              {preview.next.length > 0 ? (
                <p className="mt-1 text-textSecondary">
                  Next: {preview.next.map((n) => new Date(n.occurrenceAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).join(' · ')}
                </p>
              ) : (
                <p className="mt-1 text-textSecondary">No upcoming occurrences — the end date has already passed.</p>
              )}
              <p className="mt-1 text-[10px] text-textSecondary/70">Each occurrence is created as its own task shortly before it is due, assigned to the people above.</p>
            </>
          ) : (
            <p className="text-textSecondary">Working out the dates…</p>
          )}
        </div>
      )}
    </div>
  );
}
