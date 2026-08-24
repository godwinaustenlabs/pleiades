import React, { useState, useEffect } from 'react';
import { X, Shield, Check } from 'lucide-react';
import { token as authToken } from '../lib/auth';
import { errorMessage } from '../lib/errors';

interface AppointmentProvisionFormProps {
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  employees: any[];
  committees: any[];
  initialData?: any;
}

interface Permission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export default function AppointmentProvisionForm({ onClose, onSubmit, employees, committees, initialData }: AppointmentProvisionFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    id: initialData?.id || '',
    email: '',
    username: '',
    password: '',
    name: '',
    employeeId: initialData?.employeeId || '',
    committeeId: initialData?.committeeId || '',
    roleOrTitle: initialData?.roleOrTitle || '',
    roleId: initialData?.roleId || '',
    termType: initialData?.termType || 'permanent',
    appointmentDate: initialData?.appointmentDate || new Date().toISOString().split('T')[0],
  });

  // Access is granted by role, so this form picks a role and previews what it
  // confers rather than editing per-feature permissions for one user.
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [rolePreview, setRolePreview] = useState<Permission[]>([]);

  useEffect(() => {
    const token = authToken();
    
    // 1. Roles available to assign
    fetch('/api/admin/roles', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.data) setRoles(d.data); })
      .catch(() => {});

    // 2. Fetch current account if editing
    if (initialData?.accountId) {
      fetch(`/api/admin/users/${initialData.accountId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (d.data) {
            setFormData(prev => ({
              ...prev,
              email: d.data.email || '',
              username: d.data.username || '',
              name: d.data.name || '',
              roleId: d.data.roleId || prev.roleId,
            }));
          }
        });
    }
  }, [initialData]);

  // Show what the selected role actually grants, so the choice is legible.
  useEffect(() => {
    if (!formData.roleId) { setRolePreview([]); return; }
    fetch(`/api/admin/roles/${formData.roleId}/permissions`, { headers: { Authorization: `Bearer ${authToken()}` } })
      .then(r => r.json())
      .then(d => setRolePreview(d.data || []))
      .catch(() => setRolePreview([]));
  }, [formData.roleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Clean empty strings to null to prevent foreign key constraint errors
    const cleanedData = { ...formData } as Record<string, any>;
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === "") {
        cleanedData[key] = null;
      }
    });

    try {
      await onSubmit(cleanedData);
    } catch (err) {
      setError(errorMessage(err, 'Failed to submit form'));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-surface border border-white/10 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">{formData.id ? 'Modify' : 'Provision'} Granular Access</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary hover:text-textPrimary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">{error}</div>}
          
          <form id="provision-form" onSubmit={handleSubmit} className="space-y-8">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Core Identity */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest px-1">Authentication</h3>
                  <div className="space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div>
                      <label className="block text-[10px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">Email {formData.id ? '(Optional)' : '*'}</label>
                      <input required={!formData.id} type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">Username {formData.id ? '(Optional)' : '*'}</label>
                      <input required={!formData.id} type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">Password {formData.id ? '(Leave empty to keep)' : '*'}</label>
                      <input required={!formData.id} type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest px-1">Appointment</h3>
                  <div className="space-y-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div>
                      <label className="block text-[10px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">Target Employee *</label>
                      <select required value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary appearance-none">
                        <option value="">Select personnel...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">Functional Title *</label>
                        <input required type="text" value={formData.roleOrTitle} onChange={e => setFormData({...formData, roleOrTitle: e.target.value})} placeholder="e.g. Senior Associate" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">Effective Date *</label>
                        <input required type="date" value={formData.appointmentDate} onChange={e => setFormData({...formData, appointmentDate: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-textSecondary mb-1.5 uppercase tracking-wider">Committee Assignment</label>
                      <select value={formData.committeeId} onChange={e => setFormData({...formData, committeeId: e.target.value})} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-primary appearance-none">
                        <option value="">None</option>
                        {committees.map(c => <option key={c.id} value={c.id}>{c.committeeName}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest">Role</h3>
                </div>

                <select
                  value={formData.roleId}
                  onChange={e => setFormData(prev => ({ ...prev, roleId: e.target.value }))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-textPrimary focus:outline-none focus:border-primary/40 cursor-pointer"
                >
                  <option value="">No role — account has no access</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>

                <div className="flex-1 bg-black/30 border border-white/10 rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
                  <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-white/5">
                    {rolePreview.length === 0 && (
                      <div className="p-6 text-xs text-textSecondary italic">
                        {formData.roleId ? 'This role grants no access.' : 'Select a role to see what it grants.'}
                      </div>
                    )}
                    {rolePreview.map(p => {
                      const level = p.canDelete ? 'Manager' : p.canEdit ? 'Editor' : 'Viewer';
                      return (
                        <div key={`${p.appName}/${p.feature}`} className="flex items-center justify-between p-3 pl-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              p.canDelete ? 'bg-primary' : p.canEdit ? 'bg-amber-500' : 'bg-blue-500'
                            }`} />
                            <span className="text-xs font-medium text-textSecondary">
                              <span className="uppercase font-black text-textPrimary">{p.appName}</span> / {p.feature}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">{level}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-[10px] text-primary/80 leading-relaxed italic">
                    Permissions belong to the role, not the person. Editing a role changes access for
                    everyone who holds it — manage roles under Admin.
                  </p>
                </div>
              </div>
            </div>

          </form>
        </div>

        <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-textSecondary hover:text-white transition-colors">
            Discard
          </button>
          <button type="submit" form="provision-form" disabled={loading} className="px-8 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-full transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center gap-2">
            {loading ? 'Processing...' : (formData.id ? 'Save Changes' : 'Confirm Provisioning')}
            {!loading && <Check className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
