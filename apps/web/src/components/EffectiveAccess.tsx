import { useEffect, useState } from 'react';
import { Briefcase, Loader2, ShieldCheck, User, Users } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * What this person can actually reach, and which post each grant came from.
 *
 * Read-only, and it exists because the union is not guessable from either editor
 * alone. The matrix below it shows only the grants that belong to the PERSON; a
 * feature they reach through an appointment is absent from it. Without this panel
 * that absence reads as "they do not have it", and the fix somebody reaches for is
 * to grant it again — directly, to the person — which is the per-person sprawl
 * appointment grants exist to prevent.
 */

type Grant = { appName: string; feature: string; canView: boolean; canEdit: boolean; canDelete: boolean };

interface Sources {
  employeeId: string | null;
  isSuperadmin: boolean;
  direct: Grant[];
  appointments: { appointmentId: string; roleOrTitle: string | null; grants: Grant[] }[];
  viaCommittee: boolean;
  effective: Grant[];
}

/** Matches PermissionMatrix, so one grant does not read two ways on one screen. */
const APP_LABEL: Record<string, string> = { admin: 'HQ' };
const label = (g: Grant) => `${APP_LABEL[g.appName] ?? g.appName}/${g.feature}`;
const level = (g: Grant) => (g.canDelete ? 'delete' : g.canEdit ? 'edit' : 'view');

function Chips({ grants }: { grants: Grant[] }) {
  if (grants.length === 0) {
    return <span className="text-[11px] italic text-textSecondary">nothing</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {[...grants].sort((a, b) => label(a).localeCompare(label(b))).map((g) => (
        <span
          key={label(g)}
          className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-textSecondary"
        >
          {label(g)} <span className="opacity-60">{level(g)}</span>
        </span>
      ))}
    </div>
  );
}

export default function EffectiveAccess({ userId }: { userId: string }) {
  const [data, setData] = useState<Sources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(null);
    fetch(`${API}/admin/users/${userId}/effective-permissions`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load effective access (${r.status})`))))
      .then((b) => { if (!cancelled) setData(b?.data as Sources); })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded border border-border bg-surfaceAlt px-3 py-2 text-xs text-textSecondary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working out effective access…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded border border-border bg-surfaceAlt px-3 py-2 text-xs text-textSecondary">
        {error ?? 'No effective access to show.'}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-border bg-surfaceAlt p-3">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-textSecondary" />
        <span className="text-[10px] font-black uppercase tracking-wider text-textSecondary">
          Effective access — {data.effective.length} feature{data.effective.length === 1 ? '' : 's'}
        </span>
      </div>

      {data.isSuperadmin && (
        <p className="text-[11px] text-warning">
          Superadmin: every check is bypassed, so the lists below describe what is recorded rather
          than what this account can reach.
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-textSecondary">
        The union of the grants below. Nothing overrides anything — an appointment cannot narrow a
        personal grant and a personal grant cannot narrow a post&rsquo;s.
      </p>

      <div className="space-y-2 pt-1">
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <User className="h-3 w-3 text-textSecondary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">
              Theirs personally — edited below
            </span>
          </div>
          <Chips grants={data.direct} />
        </div>

        {data.appointments.map((a) => (
          <div key={a.appointmentId}>
            <div className="mb-1 flex items-center gap-1.5">
              <Briefcase className="h-3 w-3 text-textSecondary" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">
                {a.roleOrTitle || 'Untitled post'} — edited on the Posts tab
              </span>
            </div>
            <Chips grants={a.grants} />
          </div>
        ))}

        {!data.employeeId && (
          <p className="text-[11px] italic text-textSecondary">
            This login is not linked to an employee record, so it can hold no appointments. Its
            access is whatever is ticked below and nothing else.
          </p>
        )}

        {data.viaCommittee && (
          <div className="flex items-start gap-1.5 pt-1">
            <Users className="mt-0.5 h-3 w-3 shrink-0 text-textSecondary" />
            <span className="text-[11px] text-textSecondary">
              Sitting on a committee also confers the CRM workspace. That rule is in the code, not in
              a grant, so it does not appear in either editor.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
