import { useEffect, useState } from 'react';
import TimeLog from './TimeLog';
import { timeApi } from '../lib/time';

/**
 * "My time", plus — for a reporting manager or a department head — the people
 * whose time they may read, one at a time. Managers and heads usually hold no HR
 * grant and so never see the employee profile; this is where they look instead.
 *
 * One person at a time on purpose: there is no table of everybody's hours side by
 * side, because that is a ranking whatever it is called.
 */
interface Person { id: string; name: string; designation: string | null; relation: 'self' | 'department' | 'report' | 'hr' }

export default function TeamTime({ selfAvailable }: { selfAvailable: boolean }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [viewing, setViewing] = useState<string>('');

  useEffect(() => {
    timeApi<Person[]>('GET', '/time/people').then((p) => setPeople(p || [])).catch(() => setPeople([]));
  }, []);

  const others = people.filter((p) => p.relation !== 'self');
  const label: Record<Person['relation'], string> = { self: '', department: 'your department', report: 'reports to you', hr: '' };

  return (
    <div className="space-y-6">
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-textSecondary">Showing</label>
          <select
            value={viewing}
            onChange={(e) => setViewing(e.target.value)}
            className="bg-surfaceAlt border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            {selfAvailable && <option value="">My own time</option>}
            {!selfAvailable && <option value="">Choose a person…</option>}
            {others.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{label[p.relation] ? ` — ${label[p.relation]}` : ''}</option>
            ))}
          </select>
        </div>
      )}
      {viewing
        ? <TimeLog key={viewing} employeeId={viewing} />
        : selfAvailable
          ? <TimeLog />
          : <p className="text-sm text-textSecondary">Your login is not linked to an employee record, so there is no time of your own to show.</p>}
    </div>
  );
}
