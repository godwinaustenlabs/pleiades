import { useState, useEffect, useMemo } from 'react';
import {
  Target, TrendingUp, Calendar, LogOut,
  Settings, Megaphone, UserPlus, Home, Loader2, Lock
} from 'lucide-react';
import Login from './Login';
import GanovaGrid from '../components/GanovaGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';



type Tab = 'campaigns' | 'contacts' | 'content' | 'sprints' | 'tasks';

interface UserPermission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function Acquisition() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('campaigns');
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
    return userPermissions.find(p => p.appName === 'acquisition' && p.feature === feature) || {
      canView: false, canEdit: false, canDelete: false
    };
  };

  const fetchData = () => {
    if (!permsLoaded) return;
    setLoading(true);
    fetch(`${API}/acquisition/${tab}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
        return r.json();
      })
      .then(d => { setData(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (isAuthenticated) fetchPermissions();
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && permsLoaded) {
      fetchData();
    }
  }, [tab, isAuthenticated, permsLoaded]);

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
  };

  // Tab filtering
  const TABS = useMemo(() => {
    const all = [
      { id: 'campaigns', label: 'Campaigns', icon: Megaphone, feature: 'campaigns' },
      { id: 'contacts', label: 'Leads', icon: UserPlus, feature: 'contacts' },
      { id: 'content', label: 'Content', icon: Calendar, feature: 'content' },
      { id: 'sprints', label: 'Sprints', icon: TrendingUp, feature: 'sprints' },
      { id: 'tasks', label: 'Tasks', icon: Megaphone, feature: 'tasks' },
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
  if (!permsLoaded) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-12 h-12 text-rose-400 animate-spin" /></div>;

  if (TABS.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-[2.5rem] text-center space-y-6 max-w-md border border-white/10 shadow-2xl">
          <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
            <Lock className="w-10 h-10 text-rose-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Acquisition Restricted</h2>
          <p className="text-textSecondary text-sm leading-relaxed">
            Market expansion and lead generation data is strictly provisioned. 
            Contact HQ to authorize your granular feature-level access.
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
    const url = editingRecord ? `${API}/acquisition/${tab}/${editingRecord.id}` : `${API}/acquisition/${tab}`;
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

  const currentFeature = TABS.find(t => t.id === tab)?.feature || 'campaigns';
  const p = getPerm(currentFeature);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-8 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-rose-500/20 p-2 rounded-xl border border-rose-500/20 shadow-lg shadow-rose-500/5">
            <Target className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">GAnova<span className="text-rose-400">ACQ</span></h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-textSecondary font-black leading-none">Growth & Acquisition</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-2 p-2 text-textSecondary hover:text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all">
            <Home className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 to-pink-500 flex items-center justify-center font-bold text-xs shadow-lg shadow-rose-500/20">
              {user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Growth'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.roleName || 'Manager'}</div>
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
                  ? 'border-rose-400 text-rose-400 bg-rose-400/5'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3.5 h-3.5 ${tab === t.id ? 'text-rose-400' : 'text-textSecondary'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8 animate-in slide-in-from-bottom-2 duration-500">
        {tab !== 'tasks' && (
          <GanovaGrid
            title={TABS.find(t => t.id === tab)?.label || 'Acquisition'}
            entityName={tab.slice(0, -1)}
            columns={
              tab === 'campaigns' ? [
                { key: 'campaignName', label: 'Campaign', type: 'avatar' },
                { key: 'status', label: 'Status', type: 'status' },
                { key: 'platform', label: 'Platform', type: 'badge' },
              ] : tab === 'contacts' ? [
                { key: 'fullName', label: 'Lead Name', type: 'avatar' },
                { key: 'pipelineStage', label: 'Stage', type: 'status' },
                { key: 'source', label: 'Source', type: 'badge' },
              ] : tab === 'content' ? [
                { key: 'contentTitle', label: 'Title' },
                { key: 'status', label: 'Status', type: 'status' },
                { key: 'publishDate', label: 'Publish Date', type: 'date' },
              ] : [
                { key: 'sprintName', label: 'Sprint' },
                { key: 'status', label: 'Status', type: 'status' },
                { key: 'endDate', label: 'End Date', type: 'date' },
              ]
            }
            data={data}
            loading={loading}
            onAdd={() => { setEditingRecord(null); setShowEntityForm(true); }}
            onEdit={(r) => { setEditingRecord(r); setShowEntityForm(true); }}
            onDelete={async (r) => {
              if (!confirm(`Irreversible deletion of growth record. Confirm?`)) return;
              await fetch(`${API}/acquisition/${tab}/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
              fetchData();
            }}
            canAdd={p.canEdit}
            canEdit={p.canEdit}
            canDelete={p.canDelete}
          />
        )}
        {tab === 'tasks' && <TaskBoard department="Acquisition" canEdit={getPerm('tasks').canEdit} />}
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${tab.slice(0, -1)}` : `New ${tab.slice(0, -1)}`}
          fields={
            tab === 'campaigns' ? [
              { key: 'campaignName', label: 'Campaign Name', type: 'text', required: true },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'completed', label: 'Completed' }], required: true },
            ] : tab === 'contacts' ? [
              { key: 'fullName', label: 'Full Name', type: 'text', required: true },
              { key: 'pipelineStage', label: 'Stage', type: 'select', options: [{ value: 'lead', label: 'Lead' }, { value: 'qualified', label: 'Qualified' }, { value: 'closed', label: 'Closed' }], required: true },
            ] : tab === 'content' ? [
              { key: 'contentTitle', label: 'Title', type: 'text', required: true },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }], required: true },
            ] : [
              { key: 'sprintName', label: 'Sprint Name', type: 'text', required: true },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }], required: true },
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

export default Acquisition;
