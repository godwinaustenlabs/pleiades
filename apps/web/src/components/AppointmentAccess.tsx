import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Briefcase, Loader2, Pencil, Plus, Save, Search, Trash2, UserMinus } from 'lucide-react';
import PermissionMatrix from './PermissionMatrix';
import AppointmentForm from './AppointmentForm';
import DeleteWizard from './DeleteWizard';
import { API, authHeaders, type Grant } from '../lib/auth';
import { type FeatureCatalog } from '../lib/useFeatureCatalog';
import { errorMessage } from '../lib/errors';

/**
 * Posts: the post itself, who holds it, and what holding it reaches.
 *
 * All three on one screen deliberately. They used to be two places — the post was
 * created in HR and its permissions set here — and that split was the reason the old
 * arrangement was wrong: assigning a post IS conferring access, so the two halves of
 * one decision sat behind two different grants in two different apps. Migration 0050
 * moved the post into HQ; this screen puts them back together.
 *
 * Two grants still, and the split is the security property:
 *
 *   admin/appointments  create a post, assign it, end it, delete it.
 *   admin/permissions   edit what it reaches — the matrix at the bottom.
 *
 * Somebody may hold one and not the other, so each half is disabled independently
 * rather than the screen being all-or-nothing. Collapsing them would make
 * `admin/appointments` an escalation to everything: create a post, grant it the
 * world, appoint yourself.
 *
 * The warning under the save button is not decoration. Saving changes what the
 * CURRENT holder can reach on their very next request, and what every future holder
 * can reach. A screen that did not say so would look like it was editing a template.
 */

export interface AppointmentRow {
  id: string;
  roleOrTitle: string | null;
  isActive: boolean | null;
  employeeId: string | null;
  employee?: { name?: string | null; department?: string | null } | null;
}

export interface AppointmentRowFull extends AppointmentRow {
  committeeId?: string | null;
  appointmentDate?: string | null;
  appointmentEndDate?: string | null;
  termType?: string | null;
}

interface AppointmentAccessProps {
  appointments: AppointmentRowFull[];
  /** For the holder and committee pickers in the post form. */
  employees?: { id: string; name: string; department?: string | null }[];
  committees?: { id: string; committeeName: string }[];
  catalog?: FeatureCatalog;
  /** No `admin/permissions` edit — the matrix is read-only. */
  disabled?: boolean;
  /** No `admin/appointments` edit — the post itself cannot be created or changed. */
  disableManage?: boolean;
  /** Re-fetch the list after a create, edit or delete. */
  onChanged?: () => void;
}

const holderOf = (a: AppointmentRow) => a.employee?.name || (a.employeeId ? a.employeeId : null);

export default function AppointmentAccess({
  appointments,
  employees = [],
  committees = [],
  catalog,
  disabled = false,
  disableManage = false,
  onChanged,
}: AppointmentAccessProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** null = closed, 'new' = creating, otherwise the post being edited. */
  const [editing, setEditing] = useState<AppointmentRowFull | 'new' | null>(null);
  const [removing, setRemoving] = useState<AppointmentRowFull | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [baseline, setBaseline] = useState('[]');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback((appointmentId: string) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    fetch(`${API}/appointments/${appointmentId}/permissions`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load permissions (${r.status})`))))
      .then((b) => {
        /**
         * Both spellings, because a Drizzle row comes back camelCase and a raw D1 row
         * snake_case — the same defensive read the person editor does.
         */
        type Row = Partial<Grant> & {
          app_name?: string; can_view?: unknown; can_edit?: unknown; can_delete?: unknown;
        };
        const rows: Grant[] = ((b?.data as Row[]) || []).map((g) => ({
          appName: g.appName ?? g.app_name ?? '',
          feature: g.feature ?? '',
          canView: !!(g.canView ?? g.can_view),
          canEdit: !!(g.canEdit ?? g.can_edit),
          canDelete: !!(g.canDelete ?? g.can_delete),
        }));
        setGrants(rows);
        setBaseline(JSON.stringify(rows));
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedId) load(selectedId);
  }, [selectedId, load]);

  async function save() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API}/appointments/${selectedId}/permissions`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: grants }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Save failed (${res.status})`);
      setBaseline(JSON.stringify(grants));
      const holder = body?.data?.holder;
      setNotice(holder
        ? `Saved — ${body?.data?.count ?? grants.length} grant(s), in effect now for whoever holds this post.`
        : `Saved — ${body?.data?.count ?? grants.length} grant(s). This post is vacant, so nobody holds them yet.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...appointments].sort((a, b) => (a.roleOrTitle || '').localeCompare(b.roleOrTitle || ''));
    if (!q) return sorted;
    return sorted.filter((a) => `${a.roleOrTitle ?? ''} ${holderOf(a) ?? ''}`.toLowerCase().includes(q));
  }, [appointments, query]);

  const selected = appointments.find((a) => a.id === selectedId) ?? null;
  const dirty = JSON.stringify(grants) !== baseline;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      <div className="self-start overflow-hidden rounded-lg border border-border">
        {!disableManage && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex w-full items-center justify-center gap-1.5 border-b border-border bg-primary/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
          >
            <Plus className="h-3.5 w-3.5" /> New post
          </button>
        )}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-3.5 w-3.5 text-textSecondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a post"
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>
        <div className="max-h-[60dvh] divide-y divide-border overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-textSecondary">
              {appointments.length === 0
                ? disableManage
                  ? 'No posts yet. Creating one needs the admin/appointments feature.'
                  : 'No posts yet. Create one above, then tick what holding it should reach.'
                : 'No post matches that.'}
            </div>
          )}
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`w-full px-3 py-2 text-left hover:bg-surfaceAlt ${a.id === selectedId ? 'bg-surfaceAlt' : ''}`}
            >
              <div className="truncate text-xs font-bold">{a.roleOrTitle || 'Untitled post'}</div>
              <div className="truncate text-[10px] text-textSecondary">
                {holderOf(a) ?? 'Vacant'}
              </div>
              {a.isActive === false && (
                <div className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-textSecondary">Ended</div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border p-4">
        {!selected && (
          <div className="py-8 text-center text-xs text-textSecondary">
            Select a post to see who holds it and what holding it grants.
          </div>
        )}

        {selected && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate text-sm font-black">{selected.roleOrTitle || 'Untitled post'}</span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-textSecondary">
                  {holderOf(selected) ? `Held by ${holderOf(selected)}` : 'Vacant'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {/* The post itself, which is a different grant from the matrix below —
                    somebody may hold one and not the other. */}
                {!disableManage && (
                  <>
                    <button
                      onClick={() => setEditing(selected)}
                      title="Edit this post, or hand it to somebody else"
                      className="rounded border border-border p-1.5 text-textSecondary transition-colors hover:border-borderStrong hover:text-textPrimary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setRemoving(selected)}
                      title="Delete this post"
                      className="rounded border border-border p-1.5 text-textSecondary transition-colors hover:border-danger/40 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={save}
                  disabled={disabled || saving || !dirty || loading}
                  className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-onScrim disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? 'Saving' : dirty ? 'Save changes' : 'Saved'}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">{notice}</div>
            )}

            {selected.isActive === false ? (
              <div className="rounded border border-border bg-surfaceAlt px-3 py-2 text-xs text-textSecondary">
                This post has ended, so nothing ticked below grants anything to anyone. The
                grants are kept: making it active again restores them as they are.
              </div>
            ) : holderOf(selected) ? (
              <div className="rounded border border-border bg-surfaceAlt px-3 py-2 text-xs text-textSecondary">
                Saving changes what <span className="font-bold">{holderOf(selected)}</span> can reach
                on their next request, and what whoever holds this post next can reach. Nothing here
                is specific to them — to give one person access that does not follow the job, use the
                Access tab instead.
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded border border-border bg-surfaceAlt px-3 py-2 text-xs text-textSecondary">
                <UserMinus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Vacant, so these grants currently reach nobody. They are conferred whole on
                  whoever is appointed, which is the point of setting them up before the handover
                  rather than after it.
                </span>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 py-8 text-xs text-textSecondary">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…
              </div>
            ) : (
              <PermissionMatrix value={grants} onChange={setGrants} disabled={disabled} catalog={catalog} />
            )}
          </div>
        )}
      </div>

      {editing && (
        <AppointmentForm
          employees={employees}
          committees={committees}
          initialData={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            const isNew = editing === 'new';
            const res = await fetch(
              isNew ? `${API}/appointments` : `${API}/appointments/${(editing as AppointmentRowFull).id}`,
              {
                method: isNew ? 'POST' : 'PATCH',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              },
            );
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.error || `Could not save the post (${res.status})`);
            setEditing(null);
            // Select what was just created, so the next thing to do — tick what it
            // reaches — is already open rather than needing to be found in the list.
            if (isNew && body?.data?.id) setSelectedId(body.data.id);
            onChanged?.();
          }}
        />
      )}

      {removing && (
        <DeleteWizard
          kind="appointment"
          id={removing.id}
          name={removing.roleOrTitle || 'this post'}
          onClose={() => setRemoving(null)}
          onDeleted={() => {
            if (selectedId === removing.id) setSelectedId(null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
