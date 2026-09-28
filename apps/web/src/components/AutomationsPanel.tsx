import { useEffect, useState } from 'react';
import { Loader2, Bot, AlertCircle, CheckCircle2, Clock, Lock } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * What the system sends by itself.
 *
 * Every automated message goes out as `no-reply@`, so nobody receives a copy and
 * nobody notices when one quietly stops — a task assignment that failed for three
 * weeks looks exactly like a quiet three weeks. This page is the answer to "what
 * is that mailbox doing", and it is counted from the rows rather than read off the
 * catalogue: an event the code knows about but which has never sent anything shows
 * as zero, which is the interesting case.
 */

interface Automation {
  key: string;
  kind: 'transactional' | 'notification';
  description: string;
  template: { id: string; subject: string; isActive: boolean; updatedAt: number; updatedBy: string | null } | null;
  total: number;
  sent: number;
  failed: number;
  lastAt: number | null;
}

interface Failure {
  eventKey: string;
  toAddresses: string;
  createdAt: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  transport: string | null;
}

interface Payload {
  sender: { address: string; transport: string; isActive: boolean; dailySendCap: number } | null;
  events: Automation[];
  recentFailures: Failure[];
}

function when(ts: number | null): string {
  if (!ts) return 'never';
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString();
}

function recipients(json: string): string {
  try {
    return (JSON.parse(json) as { email: string }[]).map((a) => a.email).join(', ');
  } catch {
    return '';
  }
}

export default function AutomationsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/email/automations`, { headers: authHeaders() })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || `Could not load (${r.status})`);
        return json.data as Payload;
      })
      .then(setData)
      .catch((e) => { setError(errorMessage(e)); setData({ sender: null, events: [], recentFailures: [] }); });
  }, []);

  if (error && !data?.events.length) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-start gap-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-xs text-textSecondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading automations…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <div className="mb-1 flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-textSecondary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-textPrimary">Automated mail</h3>
        </div>
        {data.sender ? (
          <p className="text-[11px] leading-relaxed text-textSecondary">
            Everything below is sent as <span className="font-bold text-textPrimary">{data.sender.address}</span>, via{' '}
            {data.sender.transport === 'cloudflare'
              ? 'Cloudflare only — it never routes through a third party, which is why a payroll or reset notice cannot quietly do so'
              : data.sender.transport}
            . {data.sender.isActive
              ? `Limit ${data.sender.dailySendCap}/day.`
              : 'This mailbox is deactivated, so none of it is going out.'}
          </p>
        ) : (
          <p className="text-[11px] text-warning">
            The system mailbox is missing, so no automated mail can be sent at all.
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {data.events.map((e) => (
          <div key={e.key} className="border-b border-border p-3 last:border-0 md:p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-xs font-bold text-textPrimary">{e.key}</span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                e.kind === 'transactional' ? 'bg-primary/10 text-primary' : 'bg-surfaceAlt text-textSecondary'
              }`}>
                {e.kind}
              </span>
              {e.kind === 'transactional' && (
                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-textSecondary">
                  <Lock className="h-2.5 w-2.5" /> cannot be switched off
                </span>
              )}
            </div>

            <p className="mt-1 text-[11px] leading-relaxed text-textSecondary">{e.description}</p>

            {e.template ? (
              <p className="mt-1.5 truncate text-[11px] text-textSecondary">
                Subject: <span className="text-textPrimary">{e.template.subject}</span>
                {!e.template.isActive && <span className="ml-2 font-bold text-warning">template switched off</span>}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] font-bold text-danger">
                No template — this automation can never send. Seeded by migration; if it is gone, it was deleted.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-3 w-3" /> {e.sent} sent
              </span>
              {e.failed > 0 && (
                <span className="flex items-center gap-1 font-bold text-danger">
                  <AlertCircle className="h-3 w-3" /> {e.failed} failed
                </span>
              )}
              <span className="flex items-center gap-1 text-textSecondary">
                <Clock className="h-3 w-3" /> last {when(e.lastAt)}
              </span>
              {e.total === 0 && (
                // The interesting zero: the code knows about this and it has never
                // fired, which is either "not used yet" or "silently broken".
                <span className="text-textSecondary">never fired</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.recentFailures.length > 0 && (
        <div className="rounded-lg border border-danger/30 p-4">
          <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-danger">Recent failures</h3>
          <p className="mb-3 text-[11px] leading-relaxed text-textSecondary">
            These messages were queued and did not arrive. A <span className="font-bold">suppressed</span> status means
            the address bounced or complained and will not be retried; anything else has either exhausted its
            retries or is still backing off.
          </p>
          <div className="space-y-2">
            {data.recentFailures.map((f, i) => (
              <div key={i} className="rounded border border-border bg-surfaceAlt p-2.5 text-[11px]">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono font-bold text-textPrimary">{f.eventKey}</span>
                  <span className="font-bold uppercase tracking-wider text-danger">{f.status}</span>
                  {f.errorCode && <span className="font-mono text-textSecondary">{f.errorCode}</span>}
                  <span className="text-textSecondary">attempt {f.attempts}</span>
                  {f.transport && <span className="text-textSecondary">via {f.transport}</span>}
                </div>
                <div className="mt-0.5 break-words text-textSecondary">
                  to {recipients(f.toAddresses)} · {when(f.createdAt)}
                </div>
                {f.errorMessage && <div className="mt-0.5 break-words text-textSecondary">{f.errorMessage}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
