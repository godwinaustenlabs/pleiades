import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Plus, Power, AlertCircle, Users, Building2, Briefcase, CornerDownRight, Inbox, KeyRound, Pencil, Trash2, X, Check } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import DeleteWizard from './DeleteWizard';
import { errorMessage } from '../lib/errors';

/**
 * Creating and assigning mailboxes.
 *
 * Lives in HQ next to the permission matrix on purpose: deciding who
 * a mailbox belongs to and deciding what somebody can reach are the same job, done
 * by the same person, and splitting them across two screens is how the two drift.
 *
 * Note what this screen can and cannot do. It creates mailboxes and says who owns
 * them. It does NOT read them — `admin/mailboxes` deliberately confers no ability
 * to open anybody's mail, which is why there is no preview here and why a
 * personal mailbox shows its owner's name rather than its contents.
 */

interface Mailbox {
  id: string;
  address: string;
  displayName: string | null;
  kind: 'personal' | 'appointment' | 'app' | 'alias' | 'catchall' | 'system';
  ownerUserId: string | null;
  appointmentId: string | null;
  appName: string | null;
  forwardsToMailboxId: string | null;
  dailySendCap: number;
  isActive: boolean;
}

interface Person { id: string; name?: string | null; email: string }

/** A post an address can belong to, with whoever holds it right now. */
export interface AppointmentOption {
  id: string;
  roleOrTitle: string | null;
  isActive: boolean | null;
  employeeId: string | null;
  employee?: { name?: string | null } | null;
}

interface MailboxGrant { mailboxId: string; userId: string; canRead: boolean; canSend: boolean }

/** Whether delivery confirmation is wired up. See GET /api/email/delivery-health. */
interface DeliveryHealth {
  configured: boolean;
  receiving: boolean;
  handedToProvider: number;
  eventsApplied: number;
  webhookUrl: string;
  problem: string | null;
}

interface MailboxAdminProps {
  /** Apps that have an `email` feature, from the permission catalogue. */
  apps: string[];
  people: Person[];
  /** Every appointment, so an address can be attached to a post rather than a person. */
  appointments?: AppointmentOption[];
  disabled?: boolean;
}

const KIND_LABEL: Record<Mailbox['kind'], string> = {
  personal: 'Personal',
  appointment: 'Post',
  app: 'Department',
  alias: 'Alias',
  catchall: 'Catch-all',
  system: 'System',
};

const KIND_ICON: Record<Mailbox['kind'], typeof Mail> = {
  personal: Users,
  appointment: Briefcase,
  app: Building2,
  alias: CornerDownRight,
  catchall: Inbox,
  system: Mail,
};

/**
 * Buckets mailboxes under a heading naming who they belong to.
 *
 * Every app with mail gets a heading even with nothing in it, so "acquisition has no
 * mailbox" is visible rather than merely absent — which is the state that makes an
 * Email tab render its empty screen and look broken.
 */
function groupsOf(boxes: Mailbox[], apps: string[]): [string, Mailbox[]][] {
  const out: [string, Mailbox[]][] = [];
  for (const app of apps) {
    out.push([app, boxes.filter((b) => b.kind === 'app' && b.appName === app)]);
  }
  const posts = boxes.filter((b) => b.kind === 'appointment');
  // Its own heading rather than folded into "personal": these move between people
  // without being edited, which is the one thing about them worth seeing at a glance.
  if (posts.length) out.push(['Posts — follows whoever holds the appointment', posts]);
  const personal = boxes.filter((b) => b.kind === 'personal');
  if (personal.length) out.push(['Personal — one person each', personal]);
  const other = boxes.filter((b) => !['app', 'personal', 'appointment'].includes(b.kind));
  if (other.length) out.push(['Aliases, catch-all and system', other]);
  return out;
}

export default function MailboxAdmin({ apps, people, appointments = [], disabled = false }: MailboxAdminProps) {
  /** `null` until loaded — see MailboxTab for why this is a null rather than a flag. */
  const [boxes, setBoxes] = useState<Mailbox[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The mailbox whose per-user access is open, if any. */
  const [editingAccess, setEditingAccess] = useState<Mailbox | null>(null);
  const [health, setHealth] = useState<DeliveryHealth | null>(null);
  /** The mailbox whose own details are being edited, if any. */
  const [editing, setEditing] = useState<Mailbox | null>(null);
  /** The mailbox being permanently removed, if any. Deactivating is the Power button. */
  const [purging, setPurging] = useState<Mailbox | null>(null);

  const [form, setForm] = useState({
    localPart: '',
    displayName: '',
    kind: 'app' as Mailbox['kind'],
    ownerUserId: '',
    appointmentId: '',
    appName: apps[0] ?? '',
    forwardsToMailboxId: '',
    dailySendCap: '40',
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/email/mailboxes`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load mailboxes');
      setBoxes(json.data ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setBoxes((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Is delivery confirmation actually working?
   *
   * Surfaced here rather than left to the logs because the failure is invisible from
   * a mailbox: with the webhook secret unset, every message stops at "Sent" and a
   * hard bounce shows as a success. That is exactly what was happening in production,
   * and nothing in the product said so.
   */
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/email/delivery-health`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((b) => { if (!cancelled) setHealth((b?.data as DeliveryHealth) ?? null); })
      .catch(() => { if (!cancelled) setHealth(null); });
    return () => { cancelled = true; };
  }, []);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        // The domain is not the operator's to choose — the server refuses
        // anything it cannot send as, so offering a free-text domain here would
        // only produce a 400 they could not act on.
        address: `${form.localPart.trim().toLowerCase()}@godwinausten.org`,
        kind: form.kind,
        displayName: form.displayName.trim() || null,
        dailySendCap: Number(form.dailySendCap) || 200,
      };
      if (form.kind === 'personal') body.ownerUserId = form.ownerUserId;
      if (form.kind === 'appointment') body.appointmentId = form.appointmentId;
      if (form.kind === 'app') body.appName = form.appName;
      if (form.kind === 'alias') body.forwardsToMailboxId = form.forwardsToMailboxId;

      const res = await fetch(`${API}/email/mailboxes`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not create that mailbox');
      setCreating(false);
      setForm((f) => ({ ...f, localPart: '', displayName: '', ownerUserId: '' }));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  /** Moves an app mailbox to another department. */
  async function reassign(box: Mailbox, appName: string) {
    if (appName === box.appName) return;
    setError(null);
    try {
      const res = await fetch(`${API}/email/mailboxes/${box.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not move that mailbox');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function toggle(box: Mailbox) {
    try {
      if (box.isActive) {
        const res = await fetch(`${API}/email/mailboxes/${box.id}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) throw new Error((await res.json()).error || 'Could not deactivate');
      } else {
        const res = await fetch(`${API}/email/mailboxes/${box.id}`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: true }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Could not reactivate');
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const ownerName = (id: string | null) => {
    if (!id) return '—';
    const p = people.find((x) => x.id === id);
    return p ? (p.name || p.email) : id;
  };

  const postLabel = (id: string | null) => {
    if (!id) return '—';
    const appt = appointments.find((a) => a.id === id);
    if (!appt) return id;
    const holder = appt.employee?.name;
    return `${appt.roleOrTitle || 'Untitled post'} — ${holder || 'vacant'}`;
  };

  const canSubmit = form.localPart.trim() !== ''
    && (form.kind !== 'personal' || form.ownerUserId !== '')
    && (form.kind !== 'appointment' || form.appointmentId !== '')
    && (form.kind !== 'app' || form.appName !== '')
    && (form.kind !== 'alias' || form.forwardsToMailboxId !== '');

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-textPrimary">Mailboxes</h3>
          <p className="text-[11px] text-textSecondary mt-0.5">
            A personal mailbox is read only by the person it belongs to, and a
            <span className="font-bold"> post </span> mailbox only by whoever holds that
            appointment — both by ownership, neither by a grant. A department mailbox is
            reached through that department&rsquo;s <span className="font-bold">email</span> feature
            in the matrix above.
          </p>
        </div>
        {!disabled && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {health?.problem && (
        <div className="mb-3 space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="font-bold">Delivery confirmation is not working</span>
          </div>
          <p className="leading-relaxed">{health.problem}</p>
          <p className="break-all font-mono opacity-80">{health.webhookUrl}</p>
          <p className="opacity-80">
            {health.handedToProvider} message(s) accepted by the provider, {health.eventsApplied} delivery
            event(s) applied. Until this is fixed, every sent message stays on
            &ldquo;Sent&rdquo; and a bounce is indistinguishable from a success.
          </p>
        </div>
      )}

      {creating && (
        <div className="mb-4 space-y-2 rounded-lg border border-border bg-surfaceAlt p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">Address</span>
              <div className="flex items-center rounded border border-border bg-surface">
                <input
                  value={form.localPart}
                  onChange={(e) => setForm({ ...form, localPart: e.target.value })}
                  placeholder="sales"
                  className="min-w-0 flex-1 bg-transparent px-2 py-1.5 outline-none"
                />
                <span className="shrink-0 px-2 text-[11px] text-textSecondary">@godwinausten.org</span>
              </div>
            </label>

            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">Kind</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as Mailbox['kind'] })}
                className="w-full rounded border border-border bg-surface px-2 py-1.5 outline-none"
              >
                <option value="app">Department mailbox</option>
                <option value="appointment">Post — follows whoever holds it</option>
                <option value="personal">Personal — one staff member</option>
                <option value="alias">Alias — delivers into another mailbox</option>
                <option value="catchall">Catch-all — anything unmatched</option>
              </select>
            </label>

            {form.kind === 'personal' && (
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">Belongs to</span>
                <select
                  value={form.ownerUserId}
                  onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 outline-none"
                >
                  <option value="">Choose a person…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.email}</option>
                  ))}
                </select>
              </label>
            )}

            {form.kind === 'appointment' && (
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">Belongs to the post</span>
                <select
                  value={form.appointmentId}
                  onChange={(e) => setForm({ ...form, appointmentId: e.target.value })}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 outline-none"
                >
                  <option value="">Choose a post…</option>
                  {appointments.filter((a) => a.isActive !== false).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.roleOrTitle || 'Untitled post'} — {a.employee?.name || 'vacant'}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] leading-relaxed text-textSecondary">
                  Whoever holds this post reads and sends from the address, in their own
                  workspace. Reassigning the post hands the mailbox over with it — there is
                  nothing to edit here when somebody changes job.
                </span>
              </label>
            )}

            {form.kind === 'app' && (
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">Department</span>
                <select
                  value={form.appName}
                  onChange={(e) => setForm({ ...form, appName: e.target.value })}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 outline-none"
                >
                  {apps.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            )}

            {form.kind === 'alias' && (
              <label className="block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">Delivers into</span>
                <select
                  value={form.forwardsToMailboxId}
                  onChange={(e) => setForm({ ...form, forwardsToMailboxId: e.target.value })}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 outline-none"
                >
                  <option value="">Choose a mailbox…</option>
                  {/* An alias cannot point at another alias — one hop only, because
                      a chain admits a cycle and a cycle in the inbound path is a
                      loop inside a handler that must not throw. */}
                  {(boxes ?? []).filter((b) => b.kind !== 'alias' && b.kind !== 'system').map((b) => (
                    <option key={b.id} value={b.id}>{b.address}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">Display name</span>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Sales"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 outline-none"
              />
            </label>

            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-textSecondary mb-1">
                Daily send limit
              </span>
              <input
                type="number"
                value={form.dailySendCap}
                onChange={(e) => setForm({ ...form, dailySendCap: e.target.value })}
                className="w-full rounded border border-border bg-surface px-2 py-1.5 outline-none"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-textSecondary"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={saving || !canSubmit}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-onScrim disabled:opacity-40"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Create
            </button>
          </div>
        </div>
      )}

      {boxes === null ? (
        <div className="flex items-center gap-2 py-6 text-xs text-textSecondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading mailboxes…
        </div>
      ) : boxes.length === 0 ? (
        <p className="py-6 text-center text-xs text-textSecondary">
          No mailboxes yet. Create one and it appears as an Email tab for whoever can reach it.
        </p>
      ) : (
        /**
         * Grouped by who owns the mailbox, because that is the question this screen
         * exists to answer and a flat list does not answer it. The first version put
         * the department mid-sentence in a 10px truncated subtitle, after the address,
         * the cap and the transport — so on any narrow column the one attribute that
         * matters was the first thing cut off.
         */
        <div className="space-y-4">
          {groupsOf(boxes, apps).map(([heading, group]) => (
            <div key={heading}>
              <h4 className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-textSecondary">
                {heading}
                <span className="ml-1.5 font-bold normal-case tracking-normal opacity-60">
                  {group.length} {group.length === 1 ? 'mailbox' : 'mailboxes'}
                </span>
              </h4>
              <div className="overflow-hidden rounded-lg border border-border">
                {group.map((b) => {
                  const Icon = KIND_ICON[b.kind];
                  return (
                    <div key={b.id} className="flex flex-col gap-2 border-b border-border px-3 py-2.5 last:border-0 sm:flex-row sm:items-center">
                      <Icon className="hidden h-3.5 w-3.5 shrink-0 text-textSecondary sm:block" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className={`text-xs font-bold ${b.isActive ? 'text-textPrimary' : 'text-textSecondary line-through'}`}>
                            {b.address}
                          </span>
                          <span className="rounded bg-surfaceAlt px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-textSecondary">
                            {KIND_LABEL[b.kind]}
                          </span>
                          {!b.isActive && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-warning">off</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-textSecondary">
                          {b.kind === 'personal' && `Only ${ownerName(b.ownerUserId)} can read it`}
                          {b.kind === 'appointment' && `Whoever holds ${postLabel(b.appointmentId)}`}
                          {b.kind === 'app' && `Anyone with ${b.appName}/email`}
                          {b.kind === 'alias' && `Delivers into ${boxes.find((x) => x.id === b.forwardsToMailboxId)?.address ?? '—'}`}
                          {b.kind === 'catchall' && 'Anything addressed to nobody in particular'}
                          {b.kind === 'system' && 'Automated mail only — nobody can read or send as this'}
                          {b.dailySendCap > 0 && ` · ${b.dailySendCap}/day`}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* Reassigning is possible but not casual: everyone holding the
                            new department's grant gains what this mailbox has already
                            received, and the old department loses it. */}
                        {!disabled && b.kind === 'app' && (
                          <select
                            value={b.appName ?? ''}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (confirm(
                                `Move ${b.address} from ${b.appName} to ${next}?\n\n`
                                + `Everyone with ${next}/email will be able to read everything it has already received, `
                                + `and ${b.appName} will lose access.`,
                              )) reassign(b, next);
                              else e.target.value = b.appName ?? '';
                            }}
                            title="Which department this mailbox belongs to"
                            className="max-w-[9rem] rounded border border-border bg-surfaceAlt px-1.5 py-1 text-[11px] text-textPrimary outline-none"
                          >
                            {apps.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        )}
                        {!disabled && b.kind === 'app' && (
                          <button
                            onClick={() => setEditingAccess(b)}
                            title="Restrict to specific people, overriding the app grant"
                            className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!disabled && b.kind !== 'system' && (
                          <button
                            onClick={() => setEditing(b)}
                            title="Edit the display name and send cap"
                            className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!disabled && b.kind !== 'system' && (
                          <button
                            onClick={() => toggle(b)}
                            title={b.isActive ? 'Deactivate — stops sending, keeps the mail readable' : 'Reactivate'}
                            className={`rounded-lg p-1.5 transition-colors hover:bg-surfaceAlt ${b.isActive ? 'text-textSecondary' : 'text-success'}`}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* Permanent, and separate from the Power toggle on purpose:
                            deactivating is reversible and keeps the mail readable,
                            this destroys it. The wizard lists what goes and offers
                            the mbox export first. */}
                        {!disabled && b.kind !== 'system' && (
                          <button
                            onClick={() => setPurging(b)}
                            title="Delete permanently — destroys every message it holds"
                            className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MailboxEdit
          mailbox={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {purging && (
        <DeleteWizard
          kind="mailbox"
          id={purging.id}
          name={purging.address}
          onClose={() => setPurging(null)}
          onDeleted={load}
        />
      )}

      {editingAccess && (
        <MailboxAccess
          mailbox={editingAccess}
          people={people}
          onClose={() => setEditingAccess(null)}
        />
      )}
    </div>
  );
}

/**
 * Per-user access for one app mailbox — the override, not the usual mechanism.
 *
 * Normally a department mailbox is reached through that department's `email`
 * feature in the matrix above, and that is the right answer for almost every
 * mailbox. This exists for the one case the app grant cannot express: `payroll@`
 * inside HR, where three people hold `hr/email` and only one may read it.
 *
 * The behaviour worth understanding before using it: **with anybody listed here,
 * only the people listed have access, and the app grant stops applying to this
 * mailbox entirely.** Clearing the list does not lock everyone out — it returns
 * the mailbox to being governed by the app grant.
 */
function MailboxAccess({
  mailbox, people, onClose,
}: {
  mailbox: Mailbox;
  people: Person[];
  onClose: () => void;
}) {
  const [grants, setGrants] = useState<MailboxGrant[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/email/mailboxes/${mailbox.id}/grants`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((j) => setGrants(j.data ?? []))
      .catch((e) => { setError(errorMessage(e)); setGrants([]); });
  }, [mailbox.id]);

  const rowFor = (userId: string) => grants?.find((g) => g.userId === userId);

  function set(userId: string, patch: Partial<MailboxGrant>) {
    setGrants((prev) => {
      const list = prev ?? [];
      const existing = list.find((g) => g.userId === userId);
      const next = existing
        ? list.map((g) => (g.userId === userId ? { ...g, ...patch } : g))
        : [...list, { mailboxId: mailbox.id, userId, canRead: true, canSend: false, ...patch }];
      // A row with neither right is the same as no row, and keeping it would make
      // "restricted to nobody" look different from "not restricted".
      return next.filter((g) => g.canRead || g.canSend);
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/email/mailboxes/${mailbox.id}/grants`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grants: (grants ?? []).map((g) => ({ userId: g.userId, canRead: g.canRead, canSend: g.canSend })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const listed = (grants ?? []).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="sheet flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-textPrimary">Who can use this mailbox</h3>
            <p className="truncate text-[11px] text-textSecondary">{mailbox.address}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border bg-surfaceAlt px-4 py-2.5">
          <p className="text-[11px] leading-relaxed text-textSecondary">
            {listed === 0
              ? `Nobody is listed, so this mailbox follows the ${mailbox.appName}/email grant in the matrix — which is right for almost every mailbox. Name somebody here only to make this one narrower than its department.`
              : `Listed here, so ONLY these ${listed} ${listed === 1 ? 'person has' : 'people have'} access and the ${mailbox.appName}/email grant no longer applies to it. Remove everyone to hand it back to the department.`}
          </p>
        </div>

        {error && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {grants === null ? (
            <div className="flex items-center gap-2 py-8 text-xs text-textSecondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            people.map((p) => {
              const row = rowFor(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-textPrimary">{p.name || p.email}</span>
                    <span className="block truncate text-[10px] text-textSecondary">{p.email}</span>
                  </span>
                  <button
                    onClick={() => set(p.id, { canRead: !row?.canRead, ...(row?.canRead ? { canSend: false } : {}) })}
                    className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      row?.canRead ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-textSecondary'
                    }`}
                  >
                    {row?.canRead && <Check className="h-3 w-3" />} Read
                  </button>
                  <button
                    // Sending without reading is refused by the server — a reply
                    // needs the thread — so ticking Send implies Read.
                    onClick={() => set(p.id, { canSend: !row?.canSend, canRead: true })}
                    className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      row?.canSend ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-textSecondary'
                    }`}
                  >
                    {row?.canSend && <Check className="h-3 w-3" />} Send
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-textSecondary">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || grants === null}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Editing a mailbox after it exists.
 *
 * Only what is safe to change in place. `address` and `kind` are absent for the same
 * reason the PATCH route refuses them: every message already stored points at this
 * row, so changing either leaves history claiming it arrived somewhere it did not.
 * Moving a mailbox between departments has its own control on the row, because that
 * one hands everything already received to a different set of people and should not
 * be buried in a form with a Save button.
 */
function MailboxEdit({
  mailbox,
  onClose,
  onSaved,
}: {
  mailbox: Mailbox;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(mailbox.displayName ?? '');
  const [dailySendCap, setDailySendCap] = useState(String(mailbox.dailySendCap ?? 200));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/email/mailboxes/${mailbox.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          dailySendCap: Number(dailySendCap) || 0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Could not save (${res.status})`);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="scrim animate-in fade-in fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="sheet w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-5">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black uppercase tracking-widest">Edit mailbox</h3>
            <p className="truncate text-[11px] text-textSecondary">{mailbox.address}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-textSecondary transition-colors hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={mailbox.address.split('@')[0]}
              className="w-full rounded border border-border bg-surfaceAlt px-2 py-1.5 outline-none focus:border-primary"
            />
            <span className="mt-1 block text-[10px] leading-relaxed text-textSecondary">
              The name recipients see beside the address on outbound mail.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Daily send cap</span>
            <input
              type="number"
              min={0}
              value={dailySendCap}
              onChange={(e) => setDailySendCap(e.target.value)}
              className="w-full rounded border border-border bg-surfaceAlt px-2 py-1.5 outline-none focus:border-primary"
            />
            <span className="mt-1 block text-[10px] leading-relaxed text-textSecondary">
              Messages per UTC day from this mailbox. Exceeding it refuses the send loudly
              rather than dropping it. Resend also caps the whole account at 90 a day, which
              no per-mailbox number can raise.
            </span>
          </label>

          <div className="rounded-lg border border-border bg-surfaceAlt px-3 py-2 text-[10px] leading-relaxed text-textSecondary">
            The address and the kind are fixed. Every message stored here points at this
            row, so changing either would leave history claiming it arrived somewhere it
            did not — create a new mailbox instead.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-white/5 p-5">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-textSecondary">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
