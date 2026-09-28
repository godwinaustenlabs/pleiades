import { useCallback, useEffect, useState } from 'react';
import { Key, Loader2, AlertCircle, Check, X, Mail, MailWarning, Clock } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * The password-reset approval queue.
 *
 * This tab used to be a static card reading "Delegated reset approval flow is
 * active" — the badge beside it counted real requests and there was nothing to
 * click, so a locked-out colleague could not actually be let back in. The API had
 * been there all along (`GET /admin/pending-resets`, `POST /:id/approve`,
 * `POST /:id/reject`); only the screen was missing.
 *
 * Two things are surfaced that the endpoint only recently started reporting, and
 * both are the difference between a working flow and a confusing one:
 *
 *  - **Whether a recovery address exists, before you approve.** No address means
 *    no email can be delivered, and the useful moment to learn that is while
 *    looking at the request rather than after approving it.
 *  - **Whether the email actually went.** `approve` returns `emailSent` and
 *    `emailProblem`; the approval stands either way, so a failure here is an
 *    instruction ("set a recovery address, then approve again"), not an error.
 */

interface ResetRequest {
  id: string;
  userId: string;
  requestedAt: number;
  expiresAt: number;
  user?: {
    email: string;
    name?: string | null;
    username?: string | null;
    recoveryEmail?: string | null;
    isSuperadmin?: boolean | null;
  } | null;
}

function when(ts: number): string {
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString();
}

export default function PendingResets({ canApprove }: { canApprove: boolean }) {
  const [requests, setRequests] = useState<ResetRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/pending-resets`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Could not load requests (${res.status})`);
      setRequests(json.data ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setRequests([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API}/admin/pending-resets/${id}/${action}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Could not ${action} (${res.status})`);

      if (action === 'reject') {
        setNotice('Request declined.');
      } else if (json.data?.emailSent) {
        setNotice('Approved. A single-use link has been emailed to their recovery address.');
      } else {
        // The approval stands; only the delivery failed. Say which, because the
        // approver is the person who can fix it.
        setNotice(null);
        setError(`Approved, but the email did not go out: ${json.data?.emailProblem ?? 'unknown reason'}`);
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (requests === null) {
    return (
      <div className="flex items-center gap-2 py-12 text-xs text-textSecondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest text-textPrimary">Password reset requests</h2>
        <p className="mt-1 text-xs leading-relaxed text-textSecondary">
          Approving one emails a single-use link, valid for an hour, to that person&rsquo;s recovery
          address — never to their company address, which they cannot reach if they are locked out.
          Nothing is sent until you approve, and no password changes until they choose a new one.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-12 text-center">
          <Key className="mx-auto mb-3 h-8 w-8 text-textSecondary opacity-40" />
          <p className="text-xs text-textSecondary">No requests waiting.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {requests.map((r) => {
            const recovery = r.user?.recoveryEmail;
            return (
              <div key={r.id} className="flex flex-col gap-3 border-b border-border p-3 last:border-0 md:flex-row md:items-center md:p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-textPrimary">
                    {r.user?.name || r.user?.username || r.user?.email || r.userId}
                  </div>
                  <div className="truncate text-[11px] text-textSecondary">{r.user?.email}</div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1 text-textSecondary">
                      <Clock className="h-3 w-3" /> asked {when(r.requestedAt)}
                    </span>
                    {recovery ? (
                      <span className="flex items-center gap-1 text-textSecondary">
                        <Mail className="h-3 w-3" /> link goes to {recovery}
                      </span>
                    ) : (
                      // The common failure, surfaced before the click rather than after.
                      <span className="flex items-center gap-1 font-bold text-warning">
                        <MailWarning className="h-3 w-3" /> no recovery address on file — set one first
                      </span>
                    )}
                    {r.user?.isSuperadmin && (
                      <span className="font-bold text-danger">
                        superadmin — not resettable this way
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => act(r.id, 'reject')}
                    disabled={!canApprove || busy === r.id}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surfaceAlt disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </button>
                  <button
                    onClick={() => act(r.id, 'approve')}
                    disabled={!canApprove || busy === r.id || !recovery || !!r.user?.isSuperadmin}
                    title={
                      !canApprove ? 'You need Resets edit permission.'
                        : r.user?.isSuperadmin ? "A superadmin's password is reset by direct database access."
                          : !recovery ? 'Set a recovery address on their user record first.'
                            : undefined
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-module px-3 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.97] disabled:opacity-40"
                  >
                    {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
