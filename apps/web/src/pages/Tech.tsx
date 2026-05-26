import { useState, useEffect, useMemo } from 'react';
import {
  Code, LogOut,
  Layout, AlertCircle, Rocket, Home, Loader2, Lock,
  Server, GitMerge, List
} from 'lucide-react';
import Login from './Login';
import GAGrid from '../components/GAGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';
import NotificationCenter from '../components/NotificationCenter';
import MobileTabMenu from '../components/MobileTabMenu';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';

type Tab = 'projects' | 'environments' | 'releases' | 'issues' | 'tasks' | 'deployments';

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
  const [environments, setEnvironments] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);

  // Granular Permissions
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

  const user = useMemo(() => JSON.parse(localStorage.getItem('ga_user') || '{}'), []);

  const fetchPermissions = async () => {
    try {
      const res = await fetch(`${API}/permissions/user/${user.id}`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setUserPermissions(d.data || []);
      setPermsLoaded(true);
    } catch {
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
    const auth = { headers: { Authorization: `Bearer ${token()}` } };
    fetch(`${API}/core/employees`, auth).then(r => r.json()).then(d => setEmployees((d.data || []).filter((e: any) => e.employmentStatus === 'active'))).catch(() => { });
    fetch(`${API}/tech/projects`, auth).then(r => r.json()).then(d => setProjects(d.data || [])).catch(() => { });
    fetch(`${API}/tech/environments`, auth).then(r => r.json()).then(d => setEnvironments(d.data || [])).catch(() => { });
    fetch(`${API}/tech/releases`, auth).then(r => r.json()).then(d => setReleases(d.data || [])).catch(() => { });
    fetch(`${API}/tech/stories`, auth).then(r => r.json()).then(d => setStories(d.data || [])).catch(() => { });
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
      { id: 'environments', label: 'Environments', icon: Server, feature: 'environments' },
      { id: 'releases', label: 'Releases', icon: GitMerge, feature: 'releases' },
      { id: 'issues', label: 'Issues', icon: AlertCircle, feature: 'issues' },
      { id: 'deployments', label: 'Deployments', icon: Rocket, feature: 'deployments' },
      { id: 'tasks', label: 'Tasks', icon: List, feature: 'tasks' },
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
    fetchRelations();
  };

  const currentFeature = TABS.find(t => t.id === tab)?.feature || 'projects';
  const p = getPerm(currentFeature);

  /* ── Column definitions ── */
  const gridColumns = () => {
    switch (tab) {
      case 'projects': return [
        { key: 'projectName', label: 'Project', type: 'avatar' as const },
        { key: 'status', label: 'Status', type: 'status' as const },
        { key: 'priority', label: 'Priority', type: 'badge' as const },
        { key: 'owner', label: 'Owner' },
        { key: 'startDate', label: 'Start', type: 'date' as const },
        { key: 'endDate', label: 'End', type: 'date' as const },
      ];
      case 'environments': return [
        { key: 'envName', label: 'Environment', type: 'avatar' as const },
        { key: 'envType', label: 'Type', type: 'badge' as const },
        { key: 'status', label: 'Status', type: 'status' as const },
        { key: 'uptimePct', label: 'Uptime %' },
        { key: 'monthlyCost', label: 'Monthly Cost', type: 'currency' as const },
      ];
      case 'releases': return [
        { key: 'releaseName', label: 'Release', type: 'avatar' as const },
        { key: 'version', label: 'Version', type: 'badge' as const },
        { key: 'status', label: 'Status', type: 'status' as const },
        { key: 'releaseDate', label: 'Date', type: 'date' as const },
        { key: 'ciCdResult', label: 'CI/CD', type: 'badge' as const },
      ];
      case 'issues': return [
        { key: 'issueTitle', label: 'Issue', type: 'avatar' as const },
        { key: 'severity', label: 'Severity', type: 'badge' as const },
        { key: 'status', label: 'Status', type: 'status' as const },
        { key: 'assignedTo', label: 'Assigned To' },
        { key: 'slaTargetDate', label: 'SLA Date', type: 'date' as const },
      ];
      case 'deployments': return [
        { key: 'deploymentName', label: 'Deployment', type: 'avatar' as const },
        { key: 'deploymentStatus', label: 'Status', type: 'status' as const },
        { key: 'initiatedBy', label: 'Initiated By' },
        { key: 'ciCdResult', label: 'CI/CD Result', type: 'badge' as const },
      ];
      default: return [];
    }
  };

  /* ── Form field definitions ── */
  const formFields = () => {
    switch (tab) {
      case 'projects': return [
        { key: 'projectName', label: 'Project Name', type: 'text' as const, required: true },
        { key: 'description', label: 'Description', type: 'textarea' as const },
        {
          key: 'status', label: 'Status', type: 'select' as const, options: [
            { value: 'planning', label: 'Planning' },
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]
        },
        {
          key: 'priority', label: 'Priority', type: 'select' as const, options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'critical', label: 'Critical' },
          ]
        },
        { key: 'startDate', label: 'Start Date', type: 'date' as const },
        { key: 'endDate', label: 'End Date', type: 'date' as const },
        { key: 'budget', label: 'Budget ($)', type: 'number' as const },
        { key: 'owner', label: 'Project Owner', type: 'text' as const },
        { key: 'clientName', label: 'Client Name', type: 'text' as const },
        { key: 'committeeId', label: 'Committee', type: 'text' as const },
      ];
      case 'environments': return [
        { key: 'envName', label: 'Environment Name', type: 'text' as const, required: true },
        {
          key: 'envType', label: 'Type', type: 'select' as const, options: [
            { value: 'production', label: 'Production' },
            { value: 'staging', label: 'Staging' },
            { value: 'development', label: 'Development' },
            { value: 'testing', label: 'Testing' },
            { value: 'disaster_recovery', label: 'Disaster Recovery' },
          ]
        },
        {
          key: 'status', label: 'Status', type: 'select' as const, options: [
            { value: 'operational', label: 'Operational' },
            { value: 'degraded', label: 'Degraded' },
            { value: 'down', label: 'Down' },
            { value: 'maintenance', label: 'Maintenance' },
          ]
        },
        { key: 'uptimePct', label: 'Uptime %', type: 'number' as const },
        { key: 'errorRatePct', label: 'Error Rate %', type: 'number' as const },
        { key: 'avgLatencyMs', label: 'Avg Latency (ms)', type: 'number' as const },
        { key: 'monthlyCost', label: 'Monthly Cost ($)', type: 'number' as const },
      ];
      case 'releases': return [
        { key: 'releaseName', label: 'Release Name', type: 'text' as const, required: true },
        { key: 'version', label: 'Version (e.g. v2.1.0)', type: 'text' as const },
        {
          key: 'status', label: 'Status', type: 'select' as const, options: [
            { value: 'planned', label: 'Planned' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'released', label: 'Released' },
            { value: 'rolled_back', label: 'Rolled Back' },
            { value: 'cancelled', label: 'Cancelled' },
          ]
        },
        { key: 'releaseDate', label: 'Release Date', type: 'date' as const },
        {
          key: 'ciCdResult', label: 'CI/CD Result', type: 'select' as const, options: [
            { value: 'passed', label: 'Passed' },
            { value: 'failed', label: 'Failed' },
            { value: 'pending', label: 'Pending' },
            { value: 'skipped', label: 'Skipped' },
          ]
        },
        { key: 'releaseNotes', label: 'Release Notes', type: 'textarea' as const },
        { key: 'releaseOwner', label: 'Release Owner', type: 'text' as const },
        { key: 'projectId', label: 'Project', type: 'select' as const, options: projects.map(p => ({ value: p.id, label: p.projectName })) },
      ];
      case 'issues': return [
        { key: 'issueTitle', label: 'Issue Title', type: 'text' as const, required: true },
        { key: 'description', label: 'Description', type: 'textarea' as const },
        {
          key: 'severity', label: 'Severity', type: 'select' as const, options: [
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ], required: true
        },
        {
          key: 'status', label: 'Status', type: 'select' as const, options: [
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'closed', label: 'Closed' },
            { value: 'wont_fix', label: "Won't Fix" },
          ]
        },
        { key: 'reportedDate', label: 'Reported Date', type: 'date' as const },
        { key: 'slaTargetDate', label: 'SLA Target Date', type: 'date' as const },
        { key: 'resolvedDate', label: 'Resolved Date', type: 'date' as const },
        { key: 'assignedTo', label: 'Assigned To', type: 'select' as const, options: employees.map(e => ({ value: e.name, label: e.name })) },
        { key: 'projectId', label: 'Project', type: 'select' as const, options: projects.map(p => ({ value: p.id, label: p.projectName })) },
        { key: 'storyId', label: 'Linked Story', type: 'select' as const, options: stories.map(s => ({ value: s.id, label: s.storyTitle })) },
        { key: 'envId', label: 'Environment', type: 'select' as const, options: environments.map(e => ({ value: e.id, label: e.envName })) },
      ];
      case 'deployments': return [
        { key: 'deploymentName', label: 'Deployment Name', type: 'text' as const, required: true },
        {
          key: 'deploymentStatus', label: 'Deployment Status', type: 'select' as const, options: [
            { value: 'queued', label: 'Queued' },
            { value: 'running', label: 'Running' },
            { value: 'success', label: 'Success' },
            { value: 'failed', label: 'Failed' },
            { value: 'rolled_back', label: 'Rolled Back' },
            { value: 'cancelled', label: 'Cancelled' },
          ]
        },
        { key: 'initiatedBy', label: 'Initiated By', type: 'text' as const },
        {
          key: 'ciCdResult', label: 'CI/CD Result', type: 'select' as const, options: [
            { value: 'passed', label: 'Passed' },
            { value: 'failed', label: 'Failed' },
            { value: 'pending', label: 'Pending' },
          ]
        },
        {
          key: 'rollbackAvailable', label: 'Rollback Available', type: 'select' as const, options: [
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ]
        },
        { key: 'logs', label: 'Deployment Logs', type: 'textarea' as const },
        { key: 'projectId', label: 'Project', type: 'select' as const, options: projects.map(p => ({ value: p.id, label: p.projectName })) },
        { key: 'envId', label: 'Environment', type: 'select' as const, options: environments.map(e => ({ value: e.id, label: e.envName })) },
        { key: 'releaseId', label: 'Release', type: 'select' as const, options: releases.map(r => ({ value: r.id, label: `${r.releaseName} (${r.version || 'n/a'})` })) },
      ];
      default: return [];
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-teal-500/20 p-2 rounded-xl border border-teal-500/20 shadow-lg shadow-teal-500/5">
            <Code className="w-5 h-5 md:w-6 h-6 text-teal-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter leading-none"><span className="text-teal-400">TECH</span></h1>
            <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] text-textSecondary font-black leading-none">Unified Engineering</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-1 md:ml-2 p-2 text-textSecondary hover:text-teal-400 hover:bg-teal-400/10 rounded-xl transition-all">
            <Home className="w-4 h-4 md:w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 md:gap-3 pl-2 pr-2 md:pr-4 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center font-bold text-[10px] md:text-xs shadow-lg shadow-teal-500/20 overflow-hidden">
              {user.profilePhoto ? (
                <img src={user.profilePhoto} alt="User" className="w-full h-full object-cover" />
              ) : (
                user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Engineer'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.roleName || 'Lead'}</div>
            </div>
          </button>
          <div className="h-6 md:h-8 w-px bg-white/10 mx-1" />
          <button onClick={handleLogout} className="p-2 md:p-2.5 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all">
            <LogOut className="w-4 h-4 md:w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="hidden md:block border-b border-white/5 bg-surface/30 backdrop-blur-md px-4 md:px-8 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 md:gap-2 max-w-7xl mx-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 md:px-6 py-4 md:py-5 text-[9px] md:text-[11px] font-black border-b-2 transition-all uppercase tracking-widest whitespace-nowrap ${tab === t.id
                ? 'border-teal-400 text-teal-400 bg-teal-400/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${tab === t.id ? 'text-teal-400' : 'text-textSecondary'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6 md:space-y-8 animate-in slide-in-from-bottom-2 duration-500">
        <MobileTabMenu
          tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))}
          activeTab={tab}
          onTabChange={(id) => setTab(id as Tab)}
          accentColor="teal-400"
        />
        {tab !== 'tasks' && (
          <GAGrid
            title={TABS.find(t => t.id === tab)?.label || 'Engineering'}
            entityName={tab.slice(0, -1)}
            columns={gridColumns()}
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
      <NotificationCenter currentApp="tech" />

      {showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${TABS.find(t => t.id === tab)?.label.slice(0, -1) || tab}` : `New ${TABS.find(t => t.id === tab)?.label.slice(0, -1) || tab}`}
          fields={formFields()}
          initialData={editingRecord}
          onClose={() => { setShowEntityForm(false); setEditingRecord(null); }}
          onSubmit={handleEntitySubmit}
        />
      )}
    </div>
  );
}

export default Tech;
