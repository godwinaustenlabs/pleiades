import React, { useEffect, useState } from 'react';
import { X, KeyRound, Check, Loader2 } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * The one login a person has.
 *
 * Accounts used to be provisioned per APPOINTMENT, so somebody holding two posts had
 * two sets of credentials, two workspaces and two inboxes, and had to sign out of one
 * to read the other. There is now exactly one login per employee — the database
 * enforces it — and this is where it is created or amended.
 *
 * It grants nothing. What the person can reach comes from the posts they hold
 * (Access → Posts) plus anything granted to them individually (Access), so a new
 * account can sign in and reach no module at all until one of those says otherwise.
 * That is the right default: the old form's failure mode was an account quietly
 * carrying whatever a job title happened to imply.
 */

interface AccountFormProps {
  employeeId: string;
  employeeName: string;
  onClose: () => void;
  onSaved?: () => void;
}

interface ExistingAccount {
  id: string;
  email: string;
  username?: string | null;
  name?: string | null;
  isActive?: boolean | null;
  isSuperadmin?: boolean | null;
}

export default function AccountForm({ employeeId, employeeName, onClose, onSaved }: AccountFormProps) {
  const [existing, setExisting] = useState<ExistingAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({ email: '', username: '', name: '', password: '', isActive: true });

  useEffect(() => {
    let cancelled = false;
    /**
     * The account is found through the EMPLOYEE, not through an address on this form.
     * That is the whole difference from the old provisioning route, which matched on
     * the email it was given and created a new login whenever it did not recognise
     * one — which is how two accounts for one person came about.
     */
    fetch(`${API}/admin/users`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b) => {
        if (cancelled) return;
        const rows = (b?.data as (ExistingAccount & { employeeId?: string | null })[]) || [];
        const found = rows.find((u) => u.employeeId === employeeId) ?? null;
        setExisting(found);
        if (found) {
          setForm((prev) => ({
            ...prev,
            email: found.email || '',
            username: found.username || '',
            name: found.name || '',
            isActive: found.isActive !== false,
          }));
        } else {
          setForm((prev) => ({ ...prev, name: employeeName }));
        }
      })
      .catch(() => { if (!cancelled) setExisting(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, employeeName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body: Record<string, unknown> = {
        email: form.email.trim(),
        username: form.username.trim(),
        name: form.name.trim(),
        isActive: form.isActive,
      };
      // Sent only when set, so saving a name change does not need the password retyped.
      if (form.password) body.password = form.password;

      const res = await fetch(`${API}/hr/employees/${employeeId}/account`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Could not save the account (${res.status})`);
      setNotice(json?.data?.created ? 'Account created.' : 'Account updated.');
      setForm((prev) => ({ ...prev, password: '' }));
      onSaved?.();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the account'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="scrim animate-in fade-in fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="sheet flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{existing ? 'Sign-in details' : 'Create account'}</h2>
              <p className="truncate text-[11px] text-textSecondary">{employeeName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-textSecondary transition-colors hover:bg-white/10 hover:text-textPrimary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-xs text-textSecondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking for an existing account…
            </div>
          ) : (
            <>
              {error && <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</div>}
              {notice && <div className="mb-4 rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary">{notice}</div>}

              {existing?.isSuperadmin && (
                <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-[11px] leading-relaxed text-warning">
                  This account is a superadmin. Its credentials are changed by direct database access
                  only — the server refuses them here, because HR access is a far weaker permission
                  than taking over an account should need.
                </div>
              )}

              <form id="account-form" onSubmit={submit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">
                    Sign-in email {existing ? '' : '*'}
                  </label>
                  <input
                    required={!existing}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">
                    Username {existing ? '' : '*'}
                  </label>
                  <input
                    required={!existing}
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Display name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">
                    Password {existing ? '(leave empty to keep)' : '*'}
                  </label>
                  <input
                    required={!existing}
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    className="w-full rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span className="text-[11px] leading-relaxed text-textSecondary">
                    <span className="font-bold text-textPrimary">Can sign in.</span> Untick this when
                    somebody leaves. Ending one of their appointments does not do it and should not —
                    one login covers every post a person holds.
                  </span>
                </label>

                <div className="rounded-xl border border-primary/10 bg-primary/5 p-3">
                  <p className="text-[10px] italic leading-relaxed text-primary/80">
                    This account grants nothing on its own. What the person can reach comes from the
                    posts they hold and from anything granted to them individually, both on the
                    Access page.
                  </p>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 bg-white/5 p-6">
          <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-textSecondary transition-colors hover:text-white">
            Close
          </button>
          <button
            type="submit"
            form="account-form"
            disabled={saving || loading || existing?.isSuperadmin === true}
            className="flex items-center gap-2 rounded-full bg-primary px-8 py-2.5 text-sm font-bold text-surface shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Saving…' : existing ? 'Save' : 'Create account'}
            {!saving && <Check className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
