import { useState, useEffect, useMemo } from 'react';
import {
  Settings, LogOut,
  FlaskConical, Users, Briefcase, FileText, Shield, X, Check, Home, Loader2, Lock, Key, AlertCircle, Trash2
} from 'lucide-react';
import Login from './Login';
import GanovaGrid from '../components/GanovaGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';

type Tab = 'labs' | 'committees' | 'clients' | 'docs' | 'tasks';

interface UserPermission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function Ops() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('labs');
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [committeesList, setCommitteesList] = useState<any[]>([]);
  const [labsList, setLabsList] = useState<any[]>([]);
  const [clientsList, setClientsList] = useState<any[]>([]);
  const [showProvisionCrm, setShowProvisionCrm] = useState(false);
  const [showProvisionPortal, setShowProvisionPortal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientPortalStatuses, setClientPortalStatuses] = useState<Record<string, any>>({});

  // Granular Permissions
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('ganova_token');
    localStorage.removeItem('ganova_user');
    setIsAuthenticated(false);
  };

  const user = useMemo(() => JSON.parse(localStorage.getItem('ganova_user') || '{}'), []);

  const fetchPermissions = async () => {
    try {
      const res = await fetch(`${API}/permissions/user/${user.id}`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setUserPermissions(d.data || []);
      setPermsLoaded(true);
    } catch (err) {
      setPermsLoaded(true);
    }
  };

  const getPerm = (feature: string) => {
    if (user.isSuperadmin) return { canView: true, canEdit: true, canDelete: true };
    return userPermissions.find(p => p.appName === 'ops' && p.feature === feature) || {
      canView: false, canEdit: false, canDelete: false
    };
  };

  const fetchData = () => {
    if (!permsLoaded) return;
    setLoading(true);
    fetch(`${API}/core/${tab}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
        return r.json();
      })
      .then(d => { setData(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchRelations = () => {
    fetch(`${API}/core/employees`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setEmployees((d.data || []).filter((e: any) => e.employmentStatus === 'active'))).catch(() => { });
    fetch(`${API}/core/committees`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setCommitteesList(d.data || [])).catch(() => { });
    fetch(`${API}/core/labs`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setLabsList(d.data || [])).catch(() => { });
    fetch(`${API}/core/clients`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setClientsList(d.data || [])).catch(() => { });
  };

  useEffect(() => {
    if (isAuthenticated) fetchPermissions();
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && permsLoaded) {
      fetchData();
      fetchRelations();
    }
  }, [tab, isAuthenticated, permsLoaded]);

  useEffect(() => {
    if (tab === 'clients' && data.length > 0) {
      data.forEach(client => {
        if (!clientPortalStatuses[client.id]) {
          fetch(`${API}/core/clients/${client.id}/portal-status`, { headers: { Authorization: `Bearer ${token()}` } })
            .then(r => r.json()).then(d => {
              setClientPortalStatuses(prev => ({ ...prev, [client.id]: d.data }));
            }).catch(() => {});
        }
      });
    }
  }, [tab, data]);

  // Tab filtering
  const TABS = useMemo(() => {
    const all = [
      { id: 'labs', label: 'Labs', icon: FlaskConical, feature: 'labs' },
      { id: 'committees', label: 'Committees', icon: Users, feature: 'committees' },
      { id: 'clients', label: 'Clients', icon: Briefcase, feature: 'clients' },
      { id: 'docs', label: 'Documents', icon: FileText, feature: 'documents' },
      { id: 'tasks', label: 'Tasks', icon: Settings, feature: 'tasks' },
    ] as const;

    if (user.isSuperadmin) return all;
    return all.filter(t => getPerm(t.feature).canView);
  }, [userPermissions, user.isSuperadmin]);

  useEffect(() => {
    if (permsLoaded && TABS.length > 0 && !TABS.find(t => t.id === tab)) {
      setTab(TABS[0].id);
    }
  }, [TABS, permsLoaded]);

  if (!isAuthenticated) return <Login onLogin={() => setIsAuthenticated(true)} />;
  if (!permsLoaded) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-12 h-12 text-indigo-400 animate-spin" /></div>;

  if (TABS.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-[2.5rem] text-center space-y-6 max-w-md border border-white/10 shadow-2xl">
          <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto border border-indigo-500/20">
            <Lock className="w-10 h-10 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Ops Restricted</h2>
          <p className="text-textSecondary text-sm leading-relaxed">
            Administrative operations access is strictly gated. Please contact HQ to provision your feature permissions.
          </p>
          <button onClick={() => window.location.href = '/'} className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-full font-bold text-sm transition-all border border-white/10">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const handleEntitySubmit = async (formData: any) => {
    const method = editingRecord ? 'PATCH' : 'POST';
    const url = editingRecord ? `${API}/core/${tab}/${editingRecord.id}` : `${API}/core/${tab}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(formData),
    });
    if (res.status === 401) { handleLogout(); return; }
    if (!res.ok) throw new Error(`Failed to save ${tab}`);
    setShowEntityForm(false);
    setEditingRecord(null);
    fetchData();
  };

  const currentFeature = TABS.find(t => t.id === tab)?.feature || 'labs';
  const p = getPerm(currentFeature);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-8 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/20 p-2 rounded-xl border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
            <Settings className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">GAnova<span className="text-indigo-400">OPS</span></h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-textSecondary font-black leading-none">Global Infrastructure</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-2 p-2 text-textSecondary hover:text-indigo-400 hover:bg-indigo-400/10 rounded-xl transition-all">
            <Home className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center font-bold text-xs shadow-lg shadow-indigo-500/20">
              {user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Operations'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.roleName || 'Director'}</div>
            </div>
            <Settings className="w-3.5 h-3.5 text-textSecondary group-hover:rotate-90 transition-transform duration-500" />
          </button>
          <div className="h-8 w-px bg-white/10 mx-1" />
          <button onClick={handleLogout} className="p-2.5 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="border-b border-white/5 bg-surface/30 backdrop-blur-md px-8 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 max-w-7xl mx-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-6 py-5 text-[11px] font-black border-b-2 transition-all uppercase tracking-widest whitespace-nowrap ${tab === t.id
                ? 'border-indigo-400 text-indigo-400 bg-indigo-400/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3.5 h-3.5 ${tab === t.id ? 'text-indigo-400' : 'text-textSecondary'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8 animate-in slide-in-from-bottom-2 duration-500">
        {tab !== 'tasks' && (
        <GanovaGrid
          title={TABS.find(t => t.id === tab)?.label || 'Operations'}
          entityName={tab.slice(0, -1)}
          columns={
            tab === 'labs' ? [
              { key: 'labPhoto', label: 'Photo', type: 'image' },
              { key: 'labName', label: 'Lab Name', type: 'text' },
              { key: 'category', label: 'Category', type: 'badge' },
              { key: 'status', label: 'Status', type: 'status' },
              { key: 'createdAt', label: 'Established', type: 'date' },
            ] : tab === 'committees' ? [
              { key: 'committeeName', label: 'Committee Name', type: 'text' },
              { key: 'type', label: 'Type', type: 'badge' },
              { key: 'opsStatus', label: 'Ops Status', type: 'status' },
              { key: 'activeStatus', label: 'Status', render: (v) => v ? '✅ Active' : '❌ Inactive' },
            ] : tab === 'clients' ? [
              { key: 'clientPhoto', label: 'Logo', type: 'image' },
              { key: 'clientName', label: 'Company Name', type: 'text' },
              { key: 'industry', label: 'Industry', type: 'badge' },
              { key: 'contractStatus', label: 'Contract', type: 'status' },
              { 
                key: 'portalStatus', 
                label: 'Portal Access', 
                render: (_, record) => {
                  const status = clientPortalStatuses[record.id];
                  if (!status) return <span className="text-[10px] text-textSecondary italic animate-pulse">Checking...</span>;
                  if (!status.hasLogin) return <span className="text-[10px] text-red-400 font-black uppercase tracking-widest">No Access</span>;
                  return (
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${status.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${status.isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {status.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  );
                }
              },
            ] : [
              { key: 'docTitle', label: 'Document Title' },
              { key: 'category', label: 'Category', type: 'badge' },
              { key: 'attachment', label: 'File', type: 'file' },
              { key: 'createdAt', label: 'Added', type: 'date' },
            ]
          }
          data={data}
          loading={loading}
          onAdd={() => { setEditingRecord(null); setShowEntityForm(true); }}
          onEdit={(r) => { setEditingRecord(r); setShowEntityForm(true); }}
          onDelete={async (r) => {
            if (!confirm(`Confirm irreversible deletion of this ${tab.slice(0, -1)} record?`)) return;
            await fetch(`${API}/core/${tab}/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
            fetchData();
          }}
          rowActions={tab === 'clients' ? [
            {
              label: 'Provision Portal',
              icon: Key,
              onClick: (r) => { setSelectedClient(r); setShowProvisionPortal(true); },
              color: 'text-indigo-400 hover:bg-indigo-500/10'
            }
          ] : tab === 'committees' ? [
            {
              label: 'Deprovision CRM',
              icon: Trash2,
              onClick: async (r) => {
                if (!confirm(`Are you sure you want to completely deprovision the CRM for ${r.committeeName}? This will delete all tickets, documents, and memberships associated with this committee.`)) return;
                try {
                  const res = await fetch(`${API}/crm/deprovision/${r.id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token()}` }
                  });
                  if (res.ok) {
                    alert('CRM Deprovisioned successfully');
                    fetchData();
                  } else {
                    const err = await res.json();
                    alert('Error: ' + (err.error || 'Failed to deprovision'));
                  }
                } catch (err) {
                  alert('Error: ' + (err as Error).message);
                }
              },
              color: 'text-red-400 hover:bg-red-500/10'
            }
          ] : []}
          canAdd={p.canEdit}
          canEdit={p.canEdit}
          canDelete={p.canDelete}
        />
        )}

        {tab === 'committees' && (
          <div className="mt-8 space-y-6">
            <div className={`flex items-center justify-between p-8 glass-panel rounded-[2.5rem] bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20 transition-all ${!p.canEdit ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-[2rem] bg-indigo-500 flex items-center justify-center shadow-xl shadow-indigo-500/20 border border-white/10">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black mb-1 tracking-tight">Provision Committee CRM</h3>
                  <p className="text-textSecondary text-xs font-bold uppercase tracking-widest opacity-60">Operations Privilege Required</p>
                </div>
              </div>
              {p.canEdit && (
                <button onClick={() => setShowProvisionCrm(true)} className="px-10 py-4 bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2 hover:scale-105">
                  Launch CRM
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'tasks' && <TaskBoard department="Ops" canEdit={getPerm('tasks').canEdit} />}
      </main>

      {showProvisionCrm && (
        <ProvisionCrmModal
          committees={committeesList} employees={employees}
          onClose={() => setShowProvisionCrm(false)}
          onSubmit={async (data) => {
            const res = await fetch(`${API}/crm/provision`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Provisioning failed');
            setShowProvisionCrm(false);
          }}
        />
      )}

      {showProvisionPortal && selectedClient && (
        <ProvisionPortalModal
          client={selectedClient}
          onClose={() => { setShowProvisionPortal(false); setSelectedClient(null); }}
          onSubmit={async (data) => {
            const res = await fetch(`${API}/core/clients/${selectedClient.id}/provision-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(data),
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || 'Provisioning failed');
            }
            setShowProvisionPortal(false);
            setSelectedClient(null);
            // Reset status for this client to trigger re-fetch
            setClientPortalStatuses(prev => {
              const next = { ...prev };
              delete next[selectedClient.id];
              return next;
            });
          }}
        />
      )}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${tab.slice(0, -1)}` : `New ${tab.slice(0, -1)}`}
          fields={
            tab === 'labs' ? [
              { key: 'labName', label: 'Lab Name', type: 'text', required: true },
              { key: 'category', label: 'Category', type: 'text' },
              { key: 'description', label: 'Description', type: 'textarea' },
              {
                key: 'status', label: 'Status', type: 'select', options: [
                  { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'blocked', label: 'Blocked' }, { value: 'closed', label: 'Closed' },
                ], required: true
              },
              { key: 'opsLeadId', label: 'Ops Lead', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
              { key: 'labPhoto', label: 'Lab Photo', type: 'file' },
            ] : tab === 'committees' ? [
              { key: 'committeeName', label: 'Committee Name', type: 'text', required: true },
              { key: 'type', label: 'Type', type: 'text' },
              { key: 'opsStatus', label: 'Ops Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' }, { value: 'closed', label: 'Closed' }], required: true },
              { key: 'purpose', label: 'Purpose', type: 'textarea' },
              { key: 'dateFormed', label: 'Date Formed', type: 'date' },
              { key: 'activeStatus', label: 'Is Active', type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
              { key: 'labId', label: 'Associated Lab', type: 'select', options: labsList.map(l => ({ value: l.id, label: l.labName })) },
              { key: 'clientId', label: 'Associated Client', type: 'select', options: clientsList.map(c => ({ value: c.id, label: c.clientName })) },
            ] : tab === 'clients' ? [
              { key: 'clientName', label: 'Client Name', type: 'text', required: true },
              { key: 'industry', label: 'Industry', type: 'text' },
              { key: 'primaryContact', label: 'Primary Contact', type: 'text' },
              { key: 'contactEmail', label: 'Contact Email', type: 'email' },
              { key: 'phone', label: 'Phone', type: 'text' },
              { key: 'address', label: 'Address', type: 'textarea' },
              { key: 'onboardingDate', label: 'Onboarding Date', type: 'date' },
              { key: 'contractStatus', label: 'Contract', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'onboarding', label: 'Onboarding' }, { value: 'expired', label: 'Expired' }], required: true },
              { key: 'slaStatus', label: 'SLA Status', type: 'text' },
              { key: 'clientPhoto', label: 'Client Photo', type: 'file' },
            ] : tab === 'tasks' ? [
              { key: 'title', label: 'Task Title', type: 'text', required: true },
              { key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }], required: true },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'todo', label: 'To Do' }, { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' }], required: true },
              { key: 'assigneeId', label: 'Assignee', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
            ] : [
              { key: 'docTitle', label: 'Document Title', type: 'text', required: true },
              { key: 'category', label: 'Category', type: 'text' },
              { key: 'attachment', label: 'Document File', type: 'file' },
            ]
          }
          initialData={editingRecord}
          onClose={() => { setShowEntityForm(false); setEditingRecord(null); }}
          onSubmit={handleEntitySubmit}
        />
      )}
    </div>
  );
}

export default Ops;

/* ── Provision CRM Modal ── */
function ProvisionCrmModal({ committees, employees, onClose, onSubmit }: { committees: any[]; employees: any[]; onClose: () => void; onSubmit: (data: any) => Promise<void>; }) {
  const [formData, setFormData] = useState({ committeeId: '', employeeIds: [] as string[] });
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.committeeId) return;
    setLoading(true);
    try { await onSubmit(formData); } catch (err) { alert('Error: ' + (err as Error).message); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-8 border-b border-white/10 bg-white/5">
          <div><h2 className="text-xl font-black uppercase tracking-tight">Provision CRM Instance</h2><p className="text-[10px] text-textSecondary font-black uppercase tracking-widest mt-1">Operational Lifecycle Management</p></div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div><label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-3">Target Committee</label><select required value={formData.committeeId} onChange={e => setFormData({ ...formData, committeeId: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-indigo-500 appearance-none transition-all">{committees.map(c => <option key={c.id} value={c.id}>{c.committeeName}</option>)}</select></div>
          <div><label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-3">Internal Personnel Assignments</label><div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">{employees.map(emp => (<label key={emp.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all cursor-pointer group"><input type="checkbox" checked={formData.employeeIds.includes(emp.id)} onChange={e => { const ids = e.target.checked ? [...formData.employeeIds, emp.id] : formData.employeeIds.filter(id => id !== emp.id); setFormData({ ...formData, employeeIds: ids }); }} className="w-4 h-4 rounded border-white/10 bg-black/40 text-indigo-500 focus:ring-0" /><div className="flex-1"><p className="text-xs font-bold group-hover:text-white transition-colors">{emp.name}</p><p className="text-[9px] text-textSecondary uppercase font-black tracking-widest">{emp.department}</p></div></label>))}</div></div>
          <div className="pt-6 border-t border-white/10 flex justify-end gap-4"><button type="button" onClick={onClose} className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-textSecondary hover:text-white transition-colors">Discard</button><button type="submit" disabled={loading || !formData.committeeId} className="px-10 py-4 bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2 disabled:opacity-50">{loading ? 'Provisioning...' : 'Launch CRM'} <Check className="w-4 h-4" /></button></div>
        </form>
      </div>
    </div>
  );
}

/* ── Provision Portal Modal ── */
function ProvisionPortalModal({ client, onClose, onSubmit }: { client: any; onClose: () => void; onSubmit: (data: any) => Promise<void>; }) {
  const [formData, setFormData] = useState({ email: '', displayName: client.clientName || '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSubmit({ email: formData.email, displayName: formData.displayName, password: formData.password });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={onClose}>
      <div className="bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-8 border-b border-white/10 bg-white/5">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Provision Portal</h2>
            <p className="text-[10px] text-textSecondary font-black uppercase tracking-widest mt-1">Client Access Management</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Display Name</label>
            <input required value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 transition-all" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Login Email</label>
            <input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="client@company.com"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Password</label>
              <input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Confirm</label>
              <input required type="password" value={formData.confirmPassword} onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 transition-all" />
            </div>
          </div>
          <div className="pt-6 flex justify-end gap-4">
            <button type="button" onClick={onClose} className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-textSecondary hover:text-white transition-colors">Discard</button>
            <button type="submit" disabled={loading} className="px-10 py-4 bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2 disabled:opacity-50">
              {loading ? 'Provisioning...' : 'Enable Access'}
              {!loading && <Check className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
