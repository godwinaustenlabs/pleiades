import { useEffect, useState } from 'react';
import { type TaskTime, timeApi, formatDuration } from '../lib/time';

/**
 * How long a task took, and who contributed how much.
 *
 * Sorted by hours because that is how a split is read, but deliberately with no
 * rank, badge or colour scale: hours are not output, and somebody who logged three
 * hours may have unblocked the other forty. The footer says how complete the
 * figure is, so nobody reads it as more exact than it is.
 *
 * The split by person is only returned to people entitled to it (the task's
 * creator, its contributors, HR, department heads with somebody on it); everyone
 * else who can see the task sees the total.
 */
export default function TaskTimePanel({ taskId }: { taskId: string }) {
  const [t, setT] = useState<TaskTime | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    timeApi<TaskTime>('GET', `/time/tasks/${taskId}`)
      .then((r) => { if (live) setT(r); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [taskId]);

  if (failed || !t) return null;
  const people = t.contributors;
  const count = people ? people.length : t.contributorCount ?? 0;

  return (
    <div className="pt-4 border-t border-white/5">
      <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Time logged</label>
      {t.totalMs === 0 && t.runningNow === 0 ? (
        <p className="text-xs text-textSecondary">No time logged on this task yet.</p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-bold font-mono text-white">{formatDuration(t.totalMs)}</span>
            <span className="text-textSecondary"> · {count} contributor{count === 1 ? '' : 's'}</span>
            {t.runningNow > 0 && <span className="text-primary"> · {t.runningNow} working on it now</span>}
          </p>
          {people && people.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {people.map((p) => (
                <div key={p.employeeId} className="flex items-center gap-3 text-xs">
                  <span className="w-28 truncate" title={p.name}>{p.name}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <span className="block h-full bg-white/40 rounded-full" style={{ width: `${p.share * 100}%` }} />
                  </span>
                  <span className="w-16 text-right font-mono">{formatDuration(p.ms)}</span>
                  <span className="w-10 text-right text-textSecondary">{Math.round(p.share * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          {people && (
            <p className="text-[11px] text-textSecondary mt-2">
              {[
                t.durationOnlyMs ? `${formatDuration(t.durationOnlyMs)} logged without clock times` : null,
                t.changedMs ? `${formatDuration(t.changedMs)} added or edited afterwards` : null,
                t.autoClosedMs ? `${formatDuration(t.autoClosedMs)} from timers left running, not counted` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
