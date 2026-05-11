import { useState, useEffect, useMemo } from 'react';
import {
  Code, LogOut,
  Settings, Layout, AlertCircle, Rocket, Home, Loader2, Lock
} from 'lucide-react';
import Login from './Login';
import GanovaGrid from '../components/GanovaGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';

type Tab = 'projects' | 'issues' | 'tasks' | 'deployments';

interface UserPermission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function Tech() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('projects');
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [environments, setEnvironments] = useState<any[]>([]);

  // Granular Permissions
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

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
    return userPermissions.find(p => p.appName === 'tech' && p.feature === feature) || {
      canView: false, canEdit: false, canDelete: false
    };
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
  };

  const fetchData = () => {
    if (!permsLoaded) return;
    setLoading(true);
    fetch(`${API}/tech/${tab}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
        return r.json();
      })
      .then(d => { setData(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchRelations = () => {
    const fetchWithAuth = (url: string, setter: any) => {
      fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setter(d.data || [])).catch(()=>{});
    };
    fetchWithAuth(`${API}/core/employees`, setEmployees);
    fetchWithAuth(`${API}/core/committees`, () => {}); // placeholder if needed
    fetchWithAuth(`${API}/tech/projects`, setProjects);
    fetchWithAuth(`${API}/core/labs`, setLabs);
    fetchWithAuth(`${API}/core/clients`, setClients);
    fetchWithAuth(`${API}/tech/environments`, setEnvironments);
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


  // Tab filtering
  const TABS = useMemo(() => {
    const all = [
      { id: 'projects', label: 'Projects', icon: Layout, feature: 'projects' },
      { id: 'tasks', label: 'Tasks', icon: Layout, feature: 'tasks' },
      { id: 'issues', label: 'Issues', icon: AlertCircle, feature: 'issues' },
      { id: 'deployments', label: 'Deployments', icon: Rocket, feature: 'deployments' },
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
  if (!permsLoaded) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-12 h-12 text-teal-400 animate-spin" /></div>;

  if (TABS.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-[2.5rem] text-center space-y-6 max-w-md border border-white/10 shadow-2xl">
          <div className="w-20 h-20 bg-teal-500/10 rounded-full flex items-center justify-center mx-auto border border-teal-500/20">
            <Lock className="w-10 h-10 text-teal-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Tech Restricted</h2>
          <p className="text-textSecondary text-sm leading-relaxed">
            Engineering environment access is strictly audited. 
            Contact the CTO to provision your feature-level engineering permissions.
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
    const url = editingRecord ? `${API}/tech/${tab}/${editingRecord.id}` : `${API}/tech/${tab}`;
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

  const currentFeature = TABS.find(t => t.id === tab)?.feature || 'projects';
  const p = getPerm(currentFeature);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-8 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-teal-500/20 p-2 rounded-xl border border-teal-500/20 shadow-lg shadow-teal-500/5">
            <Code className="w-6 h-6 text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">GAnova<span className="text-teal-400">TECH</span></h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-textSecondary font-black leading-none">Unified Engineering</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-2 p-2 text-textSecondary hover:text-teal-400 hover:bg-teal-400/10 rounded-xl transition-all">
            <Home className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center font-bold text-xs shadow-lg shadow-teal-500/20">
              {user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Engineer'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.roleName || 'Developer'}</div>
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
                  ? 'border-teal-400 text-teal-400 bg-teal-400/5'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3.5 h-3.5 ${tab === t.id ? 'text-teal-400' : 'text-textSecondary'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8 animate-in slide-in-from-bottom-2 duration-500">
        {tab !== 'tasks' && (
          <GanovaGrid
            title={TABS.find(t => t.id === tab)?.label || 'Engineering'}
            entityName={tab.slice(0, -1)}
            columns={
              tab === 'projects' ? [
                { key: 'projectName', label: 'Project Name', type: 'avatar' },
                { key: 'status', label: 'Status', type: 'status' },
                { key: 'createdAt', label: 'Created', type: 'date' },
              ] : tab === 'issues' ? [
                { key: 'title', label: 'Title' },
                { key: 'severity', label: 'Severity', type: 'badge' },
                { key: 'status', label: 'Status', type: 'status' },
              ] : [
                { key: 'id', label: 'Deployment ID' },
                { key: 'status', label: 'Status', type: 'status' },
                { key: 'createdAt', label: 'Timestamp', type: 'date' },
              ]
            }
            data={data}
            loading={loading}
            onAdd={() => { setEditingRecord(null); setShowEntityForm(true); }}
            onEdit={(r) => { setEditingRecord(r); setShowEntityForm(true); }}
            onDelete={async (r) => {
              if (!confirm(`Irreversible deletion of engineering record. Confirm?`)) return;
              await fetch(`${API}/tech/${tab}/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
              fetchData();
            }}
            canAdd={p.canEdit}
            canEdit={p.canEdit}
            canDelete={p.canDelete}
          />
        )}
        {tab === 'tasks' && <TaskBoard department="Tech" canEdit={getPerm('tasks').canEdit} />}
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${tab.slice(0, -1)}` : `New ${tab.slice(0, -1)}`}
          fields={
            tab === 'projects' ? [
              { key: 'projectName', label: 'Project Name', type: 'text', required: true },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'archived', label: 'Archived' }], required: true },
              { key: 'startDate', label: 'Start Date', type: 'date' },
              { key: 'endDate', label: 'End Date', type: 'date' },
              { key: 'labId', label: 'Lab', type: 'select', options: labs.map(l => ({ value: l.id, label: l.labName })) },
              { key: 'clientId', label: 'Client', type: 'select', options: clients.map(c => ({ value: c.id, label: c.clientName })) },
              { key: 'leadEngineerId', label: 'Lead Engineer', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
            ] : tab === 'issues' ? [
              { key: 'issueTitle', label: 'Issue Title', type: 'text', required: true },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'severity', label: 'Severity', type: 'select', options: [{ value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }], required: true },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }], required: true },
              { key: 'projectId', label: 'Project', type: 'select', options: projects.map(p => ({ value: p.id, label: p.projectName })) },
              { key: 'reportedById', label: 'Reported By', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
              { key: 'assignedToId', label: 'Assigned To', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
            ] : [
              { key: 'deploymentName', label: 'Deployment Name', type: 'text', required: true },
              { key: 'environmentId', label: 'Environment', type: 'select', options: environments.map(e => ({ value: e.id, label: e.environmentName || e.name || e.id })) },
              { key: 'projectId', label: 'Project', type: 'select', options: projects.map(p => ({ value: p.id, label: p.projectName })) },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'queued', label: 'Queued' }, { value: 'deploying', label: 'Deploying' }, { value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' }], required: true },
              { key: 'deployedById', label: 'Deployed By', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
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

export default Tech;
