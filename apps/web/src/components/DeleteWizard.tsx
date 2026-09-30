import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Check, Download, Loader2, Trash2, Unlock, Archive, ShieldCheck, X, ChevronRight } from 'lucide-react';
import { API, authHeaders, token as authToken } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * The confirmation for deleting a post or a person.
 *
 * It replaces a `confirm()` reading "this will PERMANENTLY DELETE this appointment.
 * Are you sure?", which was worse than useless: it warned without saying what would
 * go, and the delete behind it then failed with a foreign-key error whenever the
 * answer was anything but "nothing". So the operator learned the warning was noise
 * AND could not act on the refusal.
 *
 * What is on screen is the server's own impact report — the same queries the cascade
 * runs, so the list cannot promise less than the deletion performs. Three things
 * follow from that and are the whole design:
 *
 *  - every item says its FATE, not just its count. "12 attendance days — deleted" and
 *    "1 laptop — released back to the pool" are different facts and must not be one
 *    list of scary numbers.
 *  - files that are about to be destroyed are downloadable from here, because after
 *    the confirm they are gone from R2 and there is nowhere else to get them.
 *  - a BLOCKER is not a warning. When the server reports one there is no confirm
 *    button at all, rather than a button that will return 403.
 */

type Fate = 'delete' | 'release' | 'detach' | 'keep';

interface DownloadLink { name: string; url: string }

interface ImpactItem {
  label: string;
  count: number;
  fate: Fate;
  note: string;
  examples?: string[];
  downloads?: DownloadLink[];
}

interface Impact {
  kind: 'appointment' | 'employee';
  id: string;
  label: string;
  blockers: string[];
  items: ImpactItem[];
  downloads: DownloadLink[];
  appointments?: Impact[];
}

interface DeleteWizardProps {
  kind: 'appointment' | 'employee';
  id: string;
  /** Shown while the report loads, so the dialog is never anonymous. */
  name?: string;
  onClose: () => void;
  onDeleted: () => void;
}

const FATE: Record<Fate, { label: string; icon: typeof Trash2; tone: string }> = {
  delete: { label: 'Deleted', icon: Trash2, tone: 'text-danger bg-danger/10 border-danger/20' },
  release: { label: 'Kept, let go of', icon: Unlock, tone: 'text-warning bg-warning/10 border-warning/20' },
  detach: { label: 'Kept, switched off', icon: Archive, tone: 'text-info bg-info/10 border-info/20' },
  keep: { label: 'Untouched', icon: ShieldCheck, tone: 'text-textSecondary bg-white/5 border-white/10' },
};

const base = (kind: 'appointment' | 'employee', id: string) =>
  kind === 'appointment' ? `${API}/hr/appointments/${id}` : `${API}/core/employees/${id}`;

/**
 * A download URL a browser can follow.
 *
 * `/api/assets/download/*` and the mbox export both authenticate from a `?token=`
 * query param as well as a header, which exists precisely so a plain link or an
 * `<img>` can reach them — a link cannot set an Authorization header.
 */
function authed(url: string): string {
  const t = authToken();
  if (!t) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}`;
}

export default function DeleteWizard({ kind, id, name, onClose, onDeleted }: DeleteWizardProps) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${base(kind, id)}/impact`, { headers: authHeaders() })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || `Could not work out what this would affect (${r.status})`);
        return body;
      })
      .then((b) => { if (!cancelled) setImpact(b?.data as Impact); })
      .catch((e) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, id]);

  async function confirm() {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${base(kind, id)}?cascade=1`, { method: 'DELETE', headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Delete failed (${res.status})`);
      onDeleted();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  const label = impact?.label || name || 'this record';
  const blocked = (impact?.blockers.length ?? 0) > 0;
  const files = impact?.downloads ?? [];
  // Only the files are irreversible in a way nothing else here is: after the confirm
  // they are gone from storage with nowhere to get them back from.
  const mustAcknowledge = files.length > 0;
  const canConfirm = !!impact && !blocked && !deleting && (!mustAcknowledge || acknowledged);
  const noun = kind === 'appointment' ? 'post' : 'person';

  return (
    <div className="scrim animate-in fade-in fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="sheet flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-danger/10 p-2">
              <AlertTriangle className="h-5 w-5 text-danger" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">Delete {noun}</h2>
              <p className="truncate text-[11px] text-textSecondary">{label}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-textSecondary transition-colors hover:bg-white/10 hover:text-textPrimary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center gap-2 py-8 text-xs text-textSecondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Working out what this would affect…
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}

          {impact && blocked && (
            <div className="space-y-2 rounded-xl border border-danger/30 bg-danger/10 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-danger">
                <Ban className="h-3.5 w-3.5" /> Cannot be deleted
              </div>
              {impact.blockers.map((b) => (
                <p key={b} className="text-[12px] leading-relaxed text-danger/90">{b}</p>
              ))}
            </div>
          )}

          {impact && !blocked && impact.items.length === 0 && (
            <p className="text-sm text-textSecondary">
              Nothing depends on this {noun}. Deleting it affects nothing else.
            </p>
          )}

          {impact && impact.items.length > 0 && (
            <div className="space-y-2">
              {impact.items
                // A `keep` line with a zero count is reassurance, not information, so it
                // goes last rather than competing with what is actually being destroyed.
                .slice()
                .sort((a, b) => (a.fate === 'keep' ? 1 : 0) - (b.fate === 'keep' ? 1 : 0))
                .map((item) => {
                  const f = FATE[item.fate];
                  return (
                    <div key={item.label} className={`rounded-xl border p-3 ${f.tone}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <f.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate text-xs font-bold">
                            {item.count > 0 && <span className="mr-1">{item.count}</span>}
                            {item.label}
                          </span>
                        </div>
                        <span className="shrink-0 text-[9px] font-black uppercase tracking-wider opacity-70">
                          {f.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed opacity-90">{item.note}</p>
                      {item.examples && item.examples.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {item.examples.map((e) => (
                            <li key={e} className="truncate text-[10px] opacity-70">· {e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {impact?.appointments && impact.appointments.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2 p-3 text-left text-[11px] font-bold text-textSecondary transition-colors hover:text-textPrimary"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                What each of their {impact.appointments.length} post(s) takes with it
              </button>
              {expanded && (
                <div className="space-y-3 border-t border-white/10 p-3">
                  {impact.appointments.map((a) => (
                    <div key={a.id}>
                      <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-textSecondary">{a.label}</div>
                      {a.items.length === 0 ? (
                        <p className="text-[10px] italic opacity-60">Nothing depends on it.</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {a.items.map((i) => (
                            <li key={i.label} className="text-[10px] opacity-75">
                              · {i.count} {i.label} — {FATE[i.fate].label.toLowerCase()}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-warning">
                <Download className="h-3.5 w-3.5" /> {files.length} file(s) to save first
              </div>
              <p className="text-[11px] leading-relaxed text-warning/90">
                These are removed from storage on confirm and cannot be recovered. Download anything
                the company has to retain — a signed contract or an ID scan usually is.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <a
                    key={f.url}
                    href={authed(f.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-full truncate rounded-lg border border-warning/30 bg-surface px-2 py-1 text-[10px] font-bold text-warning transition-colors hover:bg-warning/10"
                  >
                    {f.name}
                  </a>
                ))}
              </div>
              {/* Each in its own tab rather than a zip: building one would mean fetching
                  every object through the Worker and holding it in memory, on a plan with
                  10ms of CPU per request. A browser downloading N files directly is both
                  cheaper and harder to get wrong. */}
              <label className="mt-1 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] leading-relaxed text-warning">
                  I have saved anything that needs keeping. Delete the files permanently.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-white/5 p-6">
          <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-textSecondary transition-colors hover:text-white">
            Cancel
          </button>
          {/* No button at all when the server reported a blocker — one that always
              returns 403 teaches people to ignore the message above it. */}
          {!blocked && (
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="flex items-center gap-2 rounded-full bg-danger px-8 py-2.5 text-sm font-bold text-onScrim shadow-lg shadow-danger/20 transition-all hover:bg-danger/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? 'Deleting…' : `Delete ${noun} and everything above`}
              {!deleting && <Check className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
