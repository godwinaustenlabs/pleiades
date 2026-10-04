import { useEffect, useState } from 'react';
import { Play, Pause, Square, Plus, AlertCircle, X } from 'lucide-react';
import TimeEntryForm from './TimeEntryForm';
import {
  type LoggableTask, type useTimer,
  timeApi, formatDuration, formatClock, formatDate, dateIn, dismissedMissed, dismissMissed,
} from '../lib/time';

/**
 * The workspace timer: start, pause, done for now, and the task being worked on.
 *
 * Deliberately no target, no progress ring and no "you've only logged…". Pay is per
 * task and nobody owes hours; this is a record of where the time went, offered
 * to the person, not a measure applied to them.
 *
 * It also offers two repairs, both only to the person themselves: a session the
 * forgotten-timer sweep closed ("adjust it?"), and a recent day with task
 * activity but nothing logged ("add time?").
 */
type Timer = ReturnType<typeof useTimer>;

export default function TimeWidget({ timer, onOpenLog }: { timer: Timer; onOpenLog: () => void }) {
  const { state, busy, error, act, runningMs, loggedTodayMs, refresh } = timer;
  const [tasks, setTasks] = useState<LoggableTask[]>([]);
  const [taskId, setTaskId] = useState<string>('');
  const [missed, setMissed] = useState<{ date: string; tasks: { id: string; title: string }[] }[]>([]);
  const [adding, setAdding] = useState<{ date?: string; taskId?: string | null } | null>(null);

  useEffect(() => {
    timeApi<LoggableTask[] | null>('GET', '/dashboard/time/tasks').then((t) => setTasks(t || [])).catch(() => {});
    timeApi<typeof missed | null>('GET', '/dashboard/time/missed')
      .then((m) => { const gone = dismissedMissed(); setMissed((m || []).filter((d) => !gone.has(d.date))); })
      .catch(() => {});
  }, []);

  // Preselect what was last worked on, so resuming the usual thing is one tap.
  useEffect(() => {
    if (!state) return;
    if (state.openEntry?.kind === 'work') setTaskId(state.openEntry.taskId ?? '');
    else if (!taskId && state.lastTaskId && tasks.some((t) => t.id === state.lastTaskId)) setTaskId(state.lastTaskId);
  }, [state, tasks]); // eslint-disable-line react-hooks/exhaustive-deps -- taskId is the output here, not an input

  if (!state) return null;
  const tz = state.timezone;
  const working = state.state === 'working';
  const paused = state.state === 'paused';
  const currentTask = state.openEntry?.taskId ? tasks.find((t) => t.id === state.openEntry!.taskId)?.title ?? state.openEntry.taskTitle : null;

  const onTaskChange = (value: string) => {
    setTaskId(value);
    // Changing the task while working switches the running session over to it.
    if (working && (state.openEntry?.taskId ?? '') !== value) act('switch', { taskId: value || null });
  };

  const autoClosed = state.autoClosed?.[0];
  const firstMissed = missed[0];

  return (
    <div className="glass-panel p-6 rounded-3xl bg-white/5 border border-white/10 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary-dark opacity-50" />
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold">Time</h3>
        <button onClick={onOpenLog} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">My time</button>
      </div>
      <p className="text-xs text-textSecondary font-bold mb-4">{formatDate(state.today.date)}</p>

      <div className="text-center py-2">
        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${working ? 'text-primary' : 'text-textSecondary'}`}>
          {working ? 'Working' : paused ? 'Paused' : 'Not running'}
        </p>
        <p className="text-3xl font-black text-white font-mono tabular-nums">
          {state.openEntry ? formatRunning(runningMs) : '—'}
        </p>
        {working && currentTask && <p className="text-xs text-textSecondary mt-1 truncate" title={currentTask}>{currentTask}</p>}
      </div>

      <div className="mt-3">
        <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-1.5">Working on</label>
        <select
          value={taskId}
          onChange={(e) => onTaskChange(e.target.value)}
          disabled={busy}
          className="w-full bg-surfaceAlt border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
        >
          <option value="">General work</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        {state.state === 'idle' && (
          <button onClick={() => act('start', { taskId: taskId || null })} disabled={busy}
            className="col-span-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-surface font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <Play className="w-4 h-4" /> Start
          </button>
        )}
        {working && (
          <button onClick={() => act('pause')} disabled={busy}
            className="py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-2 border border-white/10 disabled:opacity-50">
            <Pause className="w-4 h-4" /> Pause
          </button>
        )}
        {paused && (
          <button onClick={() => act('resume', { taskId: taskId || null })} disabled={busy}
            className="py-3 rounded-xl bg-primary hover:bg-primary/90 text-surface font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <Play className="w-4 h-4" /> Resume
          </button>
        )}
        {(working || paused) && (
          <button onClick={() => act('done')} disabled={busy}
            className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm flex items-center justify-center gap-2 border border-white/10 disabled:opacity-50">
            <Square className="w-4 h-4" /> Done for now
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5 text-xs">
        <span className="text-textSecondary">Logged today</span>
        <span className="font-bold text-white font-mono">{formatDuration(loggedTodayMs)}</span>
      </div>
      <button onClick={() => setAdding({})} className="mt-3 w-full text-xs font-bold text-textSecondary hover:text-white flex items-center justify-center gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Add time you forgot to log
      </button>

      {autoClosed && (
        <div className="mt-4 p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs">
          <p className="font-bold text-warning flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> A timer was left running</p>
          <p className="text-textSecondary mt-1">
            The session from {formatDate(dateIn(autoClosed.startedAt, tz))} {formatClock(autoClosed.startedAt, tz)} was closed automatically. Adjust it to when you actually stopped.
          </p>
          <button onClick={onOpenLog} className="mt-2 font-bold text-white hover:underline">Adjust in My time</button>
        </div>
      )}

      {!autoClosed && firstMissed && (
        <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10 text-xs relative">
          <button onClick={() => { dismissMissed(firstMissed.date); setMissed(missed.slice(1)); }} className="absolute top-2 right-2 text-textSecondary hover:text-white" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
          <p className="font-bold text-white pr-5">Nothing logged for {formatDate(firstMissed.date)}</p>
          <p className="text-textSecondary mt-1">You updated <span className="text-white">{firstMissed.tasks[0]?.title}</span>{firstMissed.tasks.length > 1 ? ` and ${firstMissed.tasks.length - 1} more` : ''}. Add time?</p>
          <button onClick={() => setAdding({ date: firstMissed.date, taskId: firstMissed.tasks[0]?.id ?? null })} className="mt-2 font-bold text-primary hover:underline">Add time</button>
        </div>
      )}

      {adding && (
        <TimeEntryForm
          title="Add time"
          timezone={tz}
          tasks={tasks}
          defaultDate={adding.date}
          defaultTaskId={adding.taskId}
          onSubmit={async (body) => {
            await timeApi('POST', '/dashboard/time/entries', body);
            if (adding.date) { dismissMissed(adding.date); setMissed(missed.filter((m) => m.date !== adding.date)); }
            await refresh();
          }}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

/** "1:05:09" — the running clock, with seconds, unlike the totals. */
function formatRunning(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
