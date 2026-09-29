import React, { useState } from 'react';
import { X, Briefcase, Check, ArrowRight } from 'lucide-react';
import { errorMessage } from '../lib/errors';

/**
 * Creating a post, and handing one over.
 *
 * This replaces `AppointmentProvisionForm`, which created a LOGIN per appointment
 * and carried a permission matrix. Both are gone from here, deliberately:
 *
 *   - the login belongs to the person, not the post. Somebody holding two posts had
 *     two accounts under the old form and could only read one workspace at a time.
 *     Accounts are provisioned once per employee, in the directory.
 *   - the permission matrix is on the Access page, gated on `admin/permissions`.
 *     Editing an appointment takes `hr/appointments`, and anybody with that grant
 *     being able to write grants would be an escalation to anything in the system.
 *
 * What is left is the thing that actually matters: choosing who holds the post.
 * Changing that on an existing appointment moves its access, its mailbox and its
 * committee seat to the new holder, which is why the form says so out loud.
 */

interface AppointmentFormProps {
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  employees: { id: string; name: string; department?: string | null }[];
  committees: { id: string; committeeName: string }[];
  initialData?: {
    id?: string;
    employeeId?: string | null;
    committeeId?: string | null;
    roleOrTitle?: string | null;
    termType?: string | null;
    appointmentDate?: string | null;
    appointmentEndDate?: string | null;
    isActive?: boolean | null;
  } | null;
}

export default function AppointmentForm({ onClose, onSubmit, employees, committees, initialData }: AppointmentFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const editing = !!initialData?.id;
  const previousHolder = initialData?.employeeId || '';

  const [form, setForm] = useState({
    employeeId: previousHolder,
    committeeId: initialData?.committeeId || '',
    roleOrTitle: initialData?.roleOrTitle || '',
    termType: initialData?.termType || 'permanent',
    appointmentDate: initialData?.appointmentDate || new Date().toISOString().split('T')[0],
    appointmentEndDate: initialData?.appointmentEndDate || '',
    isActive: initialData?.isActive !== false,
  });

  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name || id;
  const isHandover = editing && form.employeeId !== previousHolder;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit({
        ...form,
        // '' is not null and does not exist, so it fails the foreign key rather than
        // clearing the column. The server normalises this too; doing it here keeps
        // "Vacant" from looking like a server error.
        employeeId: form.employeeId || null,
        committeeId: form.committeeId || null,
        appointmentEndDate: form.appointmentEndDate || null,
      });
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the appointment'));
      setLoading(false);
    }
  }

  return (
    <div className="scrim animate-in fade-in fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="sheet flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">{editing ? 'Edit appointment' : 'New appointment'}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-textSecondary transition-colors hover:bg-white/10 hover:text-textPrimary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
          {error && <div className="mb-6 rounded-xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

          <form id="appointment-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Title *</label>
                <input
                  required
                  type="text"
                  value={form.roleOrTitle}
                  onChange={(e) => setForm({ ...form, roleOrTitle: e.target.value })}
                  placeholder="e.g. Director Tech, PM Aureline"
                  className="w-full rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Held by</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Vacant — nobody holds it yet</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}{e.department ? ` — ${e.department}` : ''}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[10px] leading-relaxed text-textSecondary">
                  A vacant post is a real state: it keeps its access and its mailbox, reaches
                  nobody, and confers both whole on whoever is appointed next.
                </p>
              </div>

              {isHandover && (
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-warning">
                    <ArrowRight className="h-3.5 w-3.5" /> Handover
                  </div>
                  <p className="text-[11px] leading-relaxed text-warning/90">
                    {previousHolder ? nameOf(previousHolder) : 'Nobody'} → {form.employeeId ? nameOf(form.employeeId) : 'vacant'}.
                    {' '}Everything this post grants moves on save: its permissions, its mailbox, and
                    its committee seat. Nobody&rsquo;s individual access is edited, and neither
                    person&rsquo;s login is touched.
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Committee</label>
                <select
                  value={form.committeeId}
                  onChange={(e) => setForm({ ...form, committeeId: e.target.value })}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">None</option>
                  {committees.map((c) => <option key={c.id} value={c.id}>{c.committeeName}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">From *</label>
                  <input
                    required
                    type="date"
                    value={form.appointmentDate}
                    onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Until</label>
                  <input
                    type="date"
                    value={form.appointmentEndDate}
                    onChange={(e) => setForm({ ...form, appointmentEndDate: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">Term</label>
                  <select
                    value={form.termType}
                    onChange={(e) => setForm({ ...form, termType: e.target.value })}
                    className="w-full appearance-none rounded-xl border border-white/10 bg-surfaceAlt px-4 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="permanent">Permanent</option>
                    <option value="fixed">Fixed term</option>
                    <option value="acting">Acting</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="mt-0.5"
                />
                <span className="text-[11px] leading-relaxed text-textSecondary">
                  <span className="font-bold text-textPrimary">Active.</span> This is the switch on
                  whether the post grants anything — not the end date, which is a record rather than
                  a rule. Untick it and the holder loses its access on their next request, while
                  everything ticked on the Access page is kept for when it resumes.
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-primary/10 bg-primary/5 p-3">
              <p className="text-[10px] italic leading-relaxed text-primary/80">
                What this post can reach is set on the Access page, under Posts — a different
                permission from this one, because assigning somebody to a job and deciding what the
                job may open are different decisions. Sign-in details are set once per person, in the
                directory, not here.
              </p>
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 bg-white/5 p-6">
          <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-textSecondary transition-colors hover:text-white">
            Discard
          </button>
          <button
            type="submit"
            form="appointment-form"
            disabled={loading}
            className="flex items-center gap-2 rounded-full bg-primary px-8 py-2.5 text-sm font-bold text-surface shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Saving…' : isHandover ? 'Confirm handover' : editing ? 'Save changes' : 'Create appointment'}
            {!loading && <Check className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
