import React, { useState, useEffect } from 'react';
import { X, Shield, ChevronDown, ChevronRight, Check, Eye, Edit3, ShieldCheck, Minus } from 'lucide-react';

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
    termType: initialData?.termType || 'permanent',
    appointmentDate: initialData?.appointmentDate || new Date().toISOString().split('T')[0],
  });

  const [appFeatures, setAppFeatures] = useState<Record<string, string[]>>({});
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const token = localStorage.getItem('ganova_token');
    
    // 1. Fetch App Features
    fetch('/api/permissions/app-features', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setAppFeatures(d.data);
          // Expand all by default
          const expanded: Record<string, boolean> = {};
          Object.keys(d.data).forEach(app => expanded[app] = true);
          setExpandedApps(expanded);
        }
      });

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
            }));
          }
        });

      // 3. Fetch current permissions
      fetch(`/api/permissions/user/${initialData.accountId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          if (d.data) {
            setPermissions(d.data);
          }
        });
    }
  }, [initialData]);

  const getLevel = (appName: string, feature: string): 'none' | 'view' | 'edit' | 'delete' => {
    const p = permissions.find(p => p.appName === appName && p.feature === feature);
    if (!p || !p.canView) return 'none';
    if (p.canDelete) return 'delete';
    if (p.canEdit) return 'edit';
    return 'view';
  };
  
  const updateLevel = (appName: string, feature: string, level: 'none' | 'view' | 'edit' | 'delete') => {
    const canView = level !== 'none';
    const canEdit = level === 'edit' || level === 'delete';
    const canDelete = level === 'delete';
    
    setPermissions(prev => {
      const idx = prev.findIndex(p => p.appName === appName && p.feature === feature);
      if (idx > -1) {
        const newPerms = [...prev];
        newPerms[idx] = { ...newPerms[idx], canView, canEdit, canDelete };
        return newPerms;
      } else {
        return [...prev, { appName, feature, canView, canEdit, canDelete }];
      }
    });
  };
  
  const bulkSetAppLevel = (appName: string, level: 'none' | 'view' | 'edit' | 'delete') => {
    const features = appFeatures[appName] || [];
    const canView = level !== 'none';
    const canEdit = level === 'edit' || level === 'delete';
    const canDelete = level === 'delete';
    
    setPermissions(prev => {
      let next = prev.filter(p => p.appName !== appName);
      if (level !== 'none') {
        const newPerms = features.map(f => ({
          appName, feature: f, canView, canEdit, canDelete
        }));
        return [...next, ...newPerms];
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit({ ...formData, permissions });
    } catch (err: any) {
      setError(err.message || 'Failed to submit form');
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
            
            <div className="grid grid-cols-2 gap-8">
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
                  <h3 className="text-xs font-bold text-textSecondary uppercase tracking-widest">Permissions Matrix</h3>
                  <div className="flex gap-2">
                    <span className="flex items-center gap-1 text-[9px] font-bold text-textSecondary bg-white/5 px-2 py-1 rounded-md border border-white/5"><Eye className="w-2.5 h-2.5" /> View</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-textSecondary bg-white/5 px-2 py-1 rounded-md border border-white/5"><Edit3 className="w-2.5 h-2.5" /> Edit</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-textSecondary bg-white/5 px-2 py-1 rounded-md border border-white/5"><ShieldCheck className="w-2.5 h-2.5" /> Manager</span>
                  </div>
                </div>

                <div className="flex-1 bg-black/30 border border-white/10 rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
                  <div className="overflow-y-auto custom-scrollbar flex-1">
                    {Object.entries(appFeatures).map(([app, features]) => (
                      <div key={app} className="border-b border-white/5 last:border-0">
                        <div className="sticky top-0 z-10 flex items-center justify-between p-3.5 bg-surface/80 backdrop-blur-md border-b border-white/5 group hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedApps(prev => ({ ...prev, [app]: !prev[app] }))}>
                            <div className={`p-1.5 rounded-lg transition-colors ${expandedApps[app] ? 'bg-primary/20 text-primary' : 'bg-white/5 text-textSecondary'}`}>
                              {expandedApps[app] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </div>
                            <span className="text-xs font-black text-textPrimary uppercase tracking-widest">{app}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-textSecondary uppercase tracking-widest mr-2">Set All:</span>
                            {(['none', 'view', 'edit', 'delete'] as const).map(lvl => (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => bulkSetAppLevel(app, lvl)}
                                className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter border transition-all ${
                                  lvl === 'none' ? 'hover:bg-red-500/10 hover:text-red-400 border-transparent' :
                                  lvl === 'view' ? 'hover:bg-blue-500/10 hover:text-blue-400 border-transparent' :
                                  lvl === 'edit' ? 'hover:bg-amber-500/10 hover:text-amber-400 border-transparent' :
                                  'hover:bg-primary/10 hover:text-primary border-transparent'
                                }`}
                              >
                                {lvl}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {expandedApps[app] && (
                          <div className="divide-y divide-white/5 animate-in slide-in-from-top-1 duration-200">
                            {features.map(feat => {
                              const level = getLevel(app, feat);
                              return (
                                <div key={feat} className="flex items-center justify-between p-3 pl-12 hover:bg-white/[0.03] transition-colors group">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                      level === 'none' ? 'bg-white/10' :
                                      level === 'view' ? 'bg-blue-500' :
                                      level === 'edit' ? 'bg-amber-500' :
                                      'bg-primary'
                                    }`} />
                                    <span className="text-xs font-medium text-textSecondary group-hover:text-textPrimary transition-colors">{feat}</span>
                                  </div>
                                  
                                  <div className="relative group/select">
                                    <select 
                                      value={level} 
                                      onChange={e => updateLevel(app, feat, e.target.value as any)}
                                      className={`appearance-none bg-black/40 border border-white/10 rounded-lg px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider focus:outline-none transition-all pr-8 cursor-pointer ${
                                        level === 'none' ? 'text-textSecondary' :
                                        level === 'view' ? 'text-blue-400 border-blue-500/30' :
                                        level === 'edit' ? 'text-amber-400 border-amber-500/30' :
                                        'text-primary border-primary/30'
                                      }`}
                                    >
                                      <option value="none">Access: None</option>
                                      <option value="view">Access: Viewer</option>
                                      <option value="edit">Access: Editor</option>
                                      <option value="delete">Access: Manager</option>
                                    </select>
                                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                      {level === 'none' && <Minus className="w-3 h-3" />}
                                      {level === 'view' && <Eye className="w-3 h-3 text-blue-400" />}
                                      {level === 'edit' && <Edit3 className="w-3 h-3 text-amber-400" />}
                                      {level === 'delete' && <ShieldCheck className="w-3 h-3 text-primary" />}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-[10px] text-primary/80 leading-relaxed italic">
                    Levels: <span className="font-bold">Viewer</span> (Read-only), <span className="font-bold">Editor</span> (Create/Update), <span className="font-bold">Manager</span> (Full control including Delete).
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
