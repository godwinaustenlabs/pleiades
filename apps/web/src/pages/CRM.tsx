import { useState, useEffect, useMemo } from 'react';
import {
  Building2, Ticket, CheckCircle2,
  Plus, Search, Filter, MoreHorizontal,
  ChevronRight, Calendar, FileText, LayoutDashboard,
  Shield, Home, Lock, Loader2, X, Send, Trash2, Menu as MenuIcon,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import AssetPreviewModal from '../components/AssetPreviewModal';
import TaskBoard from '../components/TaskBoard';
import EntityForm from '../components/EntityForm';
import NotificationCenter from '../components/NotificationCenter';
import MobileTabMenu from '../components/MobileTabMenu';
import { API, token } from '../lib/auth';
import { usePermissions } from '../lib/usePermissions';
import { errorMessage } from '../lib/errors';


export default function CRM() {
  const [committees, setCommittees] = useState<any[]>([]);
  const [selectedCommittee, setSelectedCommittee] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tickets' | 'tasks' | 'planner' | 'documents'>('overview');
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<any[]>([]);
  const [committeeSearch, setCommitteeSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'active' | 'resolved'>('active');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicketLoading, setNewTicketLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Grants come from the shared hook, which resolves them from the user's role.
  const { grants: userPermissions, loaded: permsLoaded } = usePermissions();
  const [plannerEvents, setPlannerEvents] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [showEntityForm, setShowEntityForm] = useState<'planner' | 'document' | null>(null);
  const [editingPlanner, setEditingPlanner] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'pdf'>('image');

  const user = useMemo(() => JSON.parse(localStorage.getItem('ga_user') || '{}'), []);


  const getPerm = (feature: string) => {
    if (user.isSuperadmin) return { canView: true, canEdit: true, canDelete: true };
    return userPermissions.find(p => p.appName === 'crm' && p.feature === feature) || {
      canView: false, canEdit: false, canDelete: false
    };
  };

  const fetchCommittees = async () => {
    try {
      const res = await fetch(`${API}/crm/my-committees`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      const list = d.data || [];
      setCommittees(list);
      
      const searchParams = new URLSearchParams(window.location.search);
      const targetId = searchParams.get('id');
      
      if (targetId) {
        const target = list.find((c: any) => c.id === targetId);
        if (target) setSelectedCommittee(target);
        else if (list.length > 0) setSelectedCommittee(list[0]);
      } else if (list.length > 0) setSelectedCommittee(list[0]);
      
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommittees();
  }, []);

  const fetchTickets = async () => {
    if (!selectedCommittee || !getPerm('tickets').canView) return;
    try {
      const res = await fetch(`${API}/crm/committees/${selectedCommittee.id}/tickets`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      setTickets(d.data || []);
    } catch { /* non-fatal: leave prior state */ }
  };

  useEffect(() => {
    if (selectedCommittee) {
      fetchTickets();
      fetchPlanner();
      fetchDocuments();
      setActiveTab('overview');
    }
  }, [selectedCommittee]);

  const fetchPlanner = async () => {
    if (!selectedCommittee) return;
    try {
      const res = await fetch(`${API}/crm/committees/${selectedCommittee.id}/planner`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setPlannerEvents(d.data || []);
    } catch { /* non-fatal: leave prior state */ }
  };

  const fetchDocuments = async () => {
    if (!selectedCommittee) return;
    try {
      const res = await fetch(`${API}/crm/committees/${selectedCommittee.id}/documents`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setDocuments(d.data || []);
    } catch { /* non-fatal: leave prior state */ }
  };

  const fetchNotes = async (ticketId: string) => {
    try {
      const res = await fetch(`${API}/crm/tickets/${ticketId}/notes`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setNotes(d.data || []);
    } catch { /* non-fatal: leave prior state */ }
  };

  const handleOpenConversation = (ticket: any) => {
    setSelectedTicket(ticket);
    setShowConversation(true);
    fetchNotes(ticket.id);
  };

  const handleResolveTicket = async (ticketId: string) => {
    if (!confirm('Mark this ticket as resolved?')) return;
    try {
      const res = await fetch(`${API}/crm/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status: 'resolved' }),
      });
      if (res.ok) fetchTickets();
    } catch { /* non-fatal: leave prior state */ }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm('Are you sure you want to permanently delete this ticket? This action cannot be undone.')) return;
    try {
      const res = await fetch(`${API}/crm/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        setShowConversation(false);
        fetchTickets();
      }
    } catch { /* non-fatal: leave prior state */ }
  };

  const handleDeletePlanner = async (plannerId: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      const res = await fetch(`${API}/crm/planner/${plannerId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        fetchPlanner();
      }
    } catch { /* non-fatal: leave prior state */ }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to permanently delete this asset?')) return;
    try {
      const res = await fetch(`${API}/crm/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
      }
    } catch { /* non-fatal: leave prior state */ }
  };

  const handleEntitySubmit = async (data: any) => {
    if (!selectedCommittee) return;
    try {
      if (showEntityForm === 'planner' || editingPlanner) {
        const isEdit = !!editingPlanner;
        const method = isEdit ? 'PATCH' : 'POST';
        const url = isEdit 
          ? `${API}/crm/planner/${editingPlanner.id}`
          : `${API}/crm/committees/${selectedCommittee.id}/planner`;
        
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`Failed to ${isEdit ? 'update' : 'create'} event`);
        fetchPlanner();
      } else if (showEntityForm === 'document') {
        const res = await fetch(`${API}/crm/committees/${selectedCommittee.id}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to secure document upload');
        fetchDocuments();
      }
      setShowEntityForm(null);
      setEditingPlanner(null);
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedTicket) return;
    setNoteLoading(true);
    try {
      const res = await fetch(`${API}/crm/tickets/${selectedTicket.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ content: newNote }),
      });
      if (res.ok) {
        setNewNote('');
        fetchNotes(selectedTicket.id);
      }
    } finally { setNoteLoading(false); }
  };

  const TABS = useMemo(() => {
    const all = [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard, feature: 'tickets' }, // Overview always visible if any access
      { id: 'tickets', label: 'Support Tickets', icon: Ticket, feature: 'tickets' },
      { id: 'tasks', label: 'Task Board', icon: CheckCircle2, feature: 'tasks' },
      { id: 'planner', label: 'Planner', icon: Calendar, feature: 'planner' },
      { id: 'documents', label: 'Documents', icon: FileText, feature: 'documents' },
    ] as const;

    if (user.isSuperadmin) return all;
    return all.filter(t => t.id === 'overview' || getPerm(t.feature).canView);
  }, [userPermissions, user.isSuperadmin]);

  useEffect(() => {
    if (permsLoaded && TABS.length > 0 && !TABS.find(t => t.id === activeTab)) {
      setActiveTab(TABS[0].id as any);
    }
  }, [TABS, permsLoaded]);

  if (loading || !permsLoaded) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
    </div>
  );

  // If user has NO CRM permissions at all (and not superadmin)
  const hasAnyAccess = user.isSuperadmin || userPermissions.some(p => p.appName === 'crm' && p.canView);
  if (!hasAnyAccess) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-3xl text-center space-y-6 max-w-md border border-white/10 shadow-2xl">
          <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
            <Lock className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-2xl font-bold">CRM Restricted</h2>
          <p className="text-textSecondary text-sm leading-relaxed">
            You do not have active CRM provisioning. This portal is strictly for members of assigned committees.
          </p>
          <button onClick={() => window.location.href = '/'} className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-full font-bold text-sm transition-all border border-white/10">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden animate-in fade-in duration-700 relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Toggle Button (desktop, shown when collapsed) */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-50 flex-col items-center gap-1 py-4 px-1.5 bg-slate-900 border border-white/10 border-l-0 rounded-r-xl text-textSecondary hover:text-white hover:bg-white/5 transition-all shadow-xl"
          title="Show committees sidebar"
        >
          <PanelLeftOpen className="w-4 h-4" />
          <span className="text-[8px] font-black uppercase tracking-widest [writing-mode:vertical-rl] rotate-180">Committees</span>
        </button>
      )}

      {/* Sidebar - Committee List */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 border-r border-white/10 bg-slate-900 flex flex-col transition-all duration-300
        lg:relative lg:inset-auto
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarCollapsed ? 'lg:w-0 lg:overflow-hidden lg:border-r-0' : 'lg:w-72'}
      `}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight">GA<span className="text-rose-500">CRM</span></h1>
              <p className="text-[10px] uppercase font-black text-rose-500 tracking-widest leading-none">Unified Committees</p>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden ml-auto p-2 text-textSecondary hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="hidden lg:flex items-center gap-1 ml-auto">
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-2 text-textSecondary hover:text-white hover:bg-white/5 rounded-xl transition-all"
                title="Hide sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
              <button onClick={() => window.location.href = '/'} className="p-2 text-textSecondary hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
                <Home className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textSecondary" />
            <input
              placeholder="Filter committees..."
              value={committeeSearch}
              onChange={e => setCommitteeSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {committees
            .filter(c => (c.committeeName || '').toLowerCase().includes(committeeSearch.toLowerCase()))
            .map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCommittee(c);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all group ${selectedCommittee?.id === c.id
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20 scale-[1.02]'
                : 'hover:bg-white/5 text-textSecondary hover:text-white'
                }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${selectedCommittee?.id === c.id ? 'bg-white/20' : 'bg-white/5'}`}>
                <Building2 className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold truncate">{c.committeeName}</p>
                <p className={`text-[9px] font-black uppercase tracking-widest opacity-60`}>{c.type || 'Standard'}</p>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 transition-all ${selectedCommittee?.id === c.id ? 'rotate-90' : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-1'}`} />
            </button>
          ))}
          {committees.length === 0 && (
            <div className="text-center py-12 px-6">
              <Shield className="w-10 h-10 text-white/10 mx-auto mb-4" />
              <p className="text-xs text-textSecondary italic">You are not a member of any active committees.</p>
            </div>
          )}
        </div>

        {user.isSuperadmin && (
          <div className="p-4 border-t border-white/10 bg-white/5">
            <button
              onClick={() => window.location.href = '/ops'}
              className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-3 h-3" /> Initialize New CRM
            </button>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      {selectedCommittee ? (
        <main className="flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent">
          <header className="p-4 md:p-8 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Mobile menu toggle */}
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 bg-white/5 rounded-xl border border-white/10 text-textSecondary"
              >
                <MenuIcon className="w-6 h-6" />
              </button>
              <div>
                <div className="hidden sm:flex items-center gap-3 mb-2">
                  <div className="px-3 py-1 bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-500/20">Operational Instance</div>
                  <span className="text-textSecondary text-[10px] font-mono tracking-tighter">REF: {selectedCommittee.id}</span>
                </div>
                <h2 className="text-xl md:text-4xl font-black tracking-tight">{selectedCommittee.committeeName}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button onClick={() => window.location.href = '/'} className="p-2 md:p-3 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl border border-white/10 transition-all text-textSecondary hover:text-white">
                <Home className="w-4 h-4 md:w-5 h-5" />
              </button>
              {getPerm('tickets').canEdit && (
                <button
                  onClick={() => setShowNewTicket(true)}
                  className="px-4 md:px-6 py-2 md:py-3 bg-rose-500 text-white text-[10px] md:text-xs font-black uppercase tracking-widest rounded-xl md:rounded-2xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 flex items-center gap-2"
                >
                  <Plus className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">New Ticket</span>
                </button>
              )}
            </div>
          </header>

          <div className="px-4 md:px-8">
            <MobileTabMenu
              tabs={[
                { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                { id: 'tickets', label: 'Support Tickets', icon: Ticket },
                { id: 'tasks', label: 'Operational Tasks', icon: CheckCircle2 },
                { id: 'planner', label: 'Project Planner', icon: Calendar },
                { id: 'documents', label: 'Resources', icon: FileText },
              ]}
              activeTab={activeTab}
              onTabChange={(id) => setActiveTab(id as any)}
              accentColor="rose-500"
            />
          </div>

          <nav className="hidden md:flex px-8 items-center gap-2 border-b border-white/10">
            {[
              { id: 'overview', label: 'Overview', icon: LayoutDashboard },
              { id: 'tickets', label: 'Support Tickets', icon: Ticket },
              { id: 'tasks', label: 'Operational Tasks', icon: CheckCircle2 },
              { id: 'planner', label: 'Project Planner', icon: Calendar },
              { id: 'documents', label: 'Resources', icon: FileText },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-5 text-[11px] font-black uppercase tracking-widest transition-all relative ${activeTab === tab.id ? 'text-rose-500' : 'text-textSecondary hover:text-white'
                  }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500 rounded-full animate-in fade-in zoom-in duration-300" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            {activeTab === 'overview' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-panel p-6 rounded-3xl bg-gradient-to-br from-rose-500/10 to-transparent border border-white/10">
                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Open Tickets</h4>
                    <p className="text-5xl font-black">{tickets.filter(t => t.status === 'open').length}</p>
                  </div>
                  <div className="glass-panel p-6 rounded-3xl border border-white/10">
                    <h4 className="text-[10px] font-black text-textSecondary uppercase tracking-widest mb-1">Active Tasks</h4>
                    <p className="text-5xl font-black opacity-20">--</p>
                  </div>
                  <div className="glass-panel p-6 rounded-3xl border border-white/10">
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Stability Index</h4>
                    <p className="text-5xl font-black text-emerald-400">98%</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  <div className="space-y-4">
                    <h3 className="font-black text-sm uppercase tracking-widest text-textSecondary">Recent Communications</h3>
                    <div className="space-y-3">
                      {tickets.slice(0, 4).map((ticket) => (
                        <div key={ticket.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between hover:bg-white/5 transition-all border border-white/10 group cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg bg-white/5 ${ticket.status === 'open' ? 'text-rose-500' : 'text-emerald-500'}`}>
                              <Ticket className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold group-hover:text-rose-500 transition-colors">{ticket.title}</h4>
                              <p className="text-[9px] text-textSecondary uppercase font-black tracking-widest">{ticket.priority} • {ticket.status}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-textSecondary group-hover:translate-x-1 transition-transform" />
                        </div>
                      ))}
                      {tickets.length === 0 && <p className="text-xs text-textSecondary italic py-10 text-center glass-panel rounded-2xl border-white/5">No support history available.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'documents' && (
              <AssetPreviewModal
                url={previewUrl}
                type={previewType}
                onClose={() => setPreviewUrl(null)}
              />
            )}

            {activeTab === 'tickets' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setTicketFilter('active')}
                      className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                        ticketFilter === 'active'
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                          : 'bg-white/5 text-textSecondary hover:text-white border border-white/10'
                      }`}
                    >Active Queue</button>
                    <button
                      onClick={() => setTicketFilter('resolved')}
                      className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                        ticketFilter === 'resolved'
                          ? 'bg-white/10 text-white'
                          : 'bg-white/5 text-textSecondary hover:text-white border border-white/10'
                      }`}
                    >Resolved</button>
                  </div>
                  <div className="flex items-center gap-2 text-textSecondary hover:text-rose-500 transition-colors cursor-pointer">
                    <Filter className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Filter Matrix</span>
                  </div>
                </div>
                <div className="space-y-4">
                  {tickets
                    .filter(t => ticketFilter === 'active' ? t.status !== 'closed' : t.status === 'closed')
                    .map((ticket) => (
                    <div key={ticket.id} className="glass-panel p-6 rounded-3xl border border-white/10 hover:border-rose-500/30 transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${ticket.priority === 'urgent' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                              }`}>{ticket.priority}</span>
                            <span className="text-textSecondary text-[10px] font-mono">#{ticket.id}</span>
                          </div>
                          <h3 className="text-xl font-bold group-hover:text-rose-500 transition-colors">{ticket.title}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-bold leading-none mb-1">{ticket.status === 'open' ? 'PENDING' : 'IN REVIEW'}</p>
                            <p className="text-[9px] text-textSecondary uppercase tracking-widest font-black">Raised {new Date(ticket.createdAt).toLocaleDateString()}</p>
                          </div>
                          {getPerm('tickets').canEdit && (
                            <button className="p-2 hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10">
                              <MoreHorizontal className="w-5 h-5 text-textSecondary" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-textSecondary line-clamp-2 mb-6 leading-relaxed italic">"{ticket.description || 'No detailed description available.'}"</p>
                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-textSecondary">
                          <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center text-[8px]">{ticket.raisedByType === 'client' ? 'C' : 'E'}</div>
                          <span>Origin: {ticket.raisedByType}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {ticket.status !== 'resolved' && getPerm('tickets').canEdit && (
                            <button onClick={() => handleResolveTicket(ticket.id)} className="text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors">Mark Resolved</button>
                          )}
                          {getPerm('tickets').canDelete && (
                            <button onClick={() => handleDeleteTicket(ticket.id)} className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors">Delete Ticket</button>
                          )}
                          <button onClick={() => handleOpenConversation(ticket)} className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 transition-colors">Open Conversation</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {tickets.length === 0 && (
                    <div className="py-24 text-center glass-panel rounded-3xl border-dashed border-white/10 bg-white/[0.01]">
                      <Ticket className="w-16 h-16 text-textSecondary mx-auto mb-6 opacity-10" />
                      <p className="text-textSecondary font-black uppercase tracking-widest text-xs">No Active Support Records</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'documents' && (
              <AssetPreviewModal
                url={previewUrl}
                type={previewType}
                onClose={() => setPreviewUrl(null)}
              />
            )}

            {activeTab === 'tasks' && (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <TaskBoard department="CRM" committeeId={selectedCommittee.id} accentColor="rose-500" canEdit={getPerm('tasks').canEdit} />
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black tracking-tight">Institutional Assets</h3>
                  {getPerm('documents').canEdit && (
                    <button 
                      onClick={() => setShowEntityForm('document')}
                      className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border border-white/10 shadow-xl"
                    >
                      <Plus className="w-4 h-4" /> Secure Upload
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {documents.map(doc => (
                    <div key={doc.id} className="glass-panel p-6 rounded-3xl group hover:border-rose-500/30 transition-all cursor-pointer border border-white/10 bg-white/[0.02]">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:bg-rose-500/10 group-hover:text-rose-500 transition-all border border-white/10">
                        <FileText className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-sm mb-1 truncate group-hover:text-rose-500 transition-colors">{doc.title}</h4>
                      <p className="text-[9px] text-textSecondary font-black uppercase tracking-widest">{doc.docType || 'Document'} • {Math.round(doc.fileSize / 1024)} KB</p>
                      <button 
                        onClick={() => {
                          const baseUrl = doc.r2Key.startsWith('/api/assets/download/') ? '' : '/api/assets/download/';
                          const url = `${baseUrl}${doc.r2Key}?token=${token()}`;
                          const isPdf = /\.(pdf)(\?|$)/i.test(doc.r2Key);
                          setPreviewType(isPdf ? 'pdf' : 'image');
                          setPreviewUrl(url);
                        }}
                        className="mt-4 block w-full text-center py-2 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                      >
                        View Asset
                      </button>
                      {getPerm('documents').canDelete && (
                        <button 
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="mt-2 block w-full text-center py-2 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                        >
                          Delete Asset
                        </button>
                      )}
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <div className="col-span-full py-12 text-center opacity-20 italic text-sm">No institutional assets found.</div>
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'documents' && (
              <AssetPreviewModal
                url={previewUrl}
                type={previewType}
                onClose={() => setPreviewUrl(null)}
              />
            )}

            {activeTab === 'planner' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black tracking-tight">Committee Planner</h3>
                  {getPerm('planner').canEdit && (
                    <button 
                      onClick={() => setShowEntityForm('planner')}
                      className="px-6 py-3 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                    >
                      New Event
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {plannerEvents.map(evt => (
                    <div key={evt.id} className="glass-panel p-6 rounded-3xl border border-white/10 flex items-center justify-between group hover:border-rose-500/30 transition-all cursor-pointer" onClick={() => setEditingPlanner(evt)}>
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex flex-col items-center justify-center border border-white/10">
                          <span className="text-[9px] font-black uppercase text-rose-500">{new Date(evt.startDate).toLocaleString('default', { month: 'short' })}</span>
                          <span className="text-xl font-black leading-none">{new Date(evt.startDate).getDate()}</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-bold group-hover:text-rose-500 transition-colors">{evt.title}</h4>
                          <p className="text-xs text-textSecondary">{evt.description}</p>
                          <div className="flex gap-2 mt-2">
                             <span className="px-2 py-0.5 bg-white/5 rounded-md text-[9px] font-black uppercase text-textSecondary border border-white/10">{evt.eventType}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getPerm('planner').canDelete && (
                          <button onClick={(e) => { e.stopPropagation(); handleDeletePlanner(evt.id); }} className="p-2 text-red-500 hover:bg-red-500/20 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                        <ChevronRight className="w-5 h-5 text-textSecondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  ))}
                  {plannerEvents.length === 0 && (
                    <div className="py-24 text-center glass-panel rounded-3xl border-dashed border-white/10 bg-white/[0.01]">
                      <Calendar className="w-20 h-20 text-rose-500 mx-auto mb-6 opacity-10" />
                      <p className="text-textSecondary font-black uppercase tracking-widest text-xs">No Scheduled Milestones</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {activeTab === 'documents' && (
              <AssetPreviewModal
                url={previewUrl}
                type={previewType}
                onClose={() => setPreviewUrl(null)}
              />
            )}
          </div>
        </main>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-20 animate-in zoom-in-95 duration-700">
          <div className="w-32 h-32 rounded-[2.5rem] bg-white/[0.02] flex items-center justify-center mb-10 border border-white/10 shadow-2xl">
            <Building2 className="w-16 h-16 text-white/10" />
          </div>
          <h2 className="text-4xl font-black tracking-tighter mb-4">No Selected Context</h2>
          <p className="text-textSecondary max-w-xs text-sm leading-relaxed font-medium">
            Select a committee from the operational sidebar to synchronize with its CRM instance.
          </p>
        </div>
      )}
      {/* Create Ticket Modal */}
      {showNewTicket && selectedCommittee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={() => setShowNewTicket(false)}>
          <div className="bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-8 border-b border-white/10 bg-white/5">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">New Support Ticket</h2>
                <p className="text-[10px] text-textSecondary font-black uppercase tracking-widest mt-1">{selectedCommittee.committeeName}</p>
              </div>
              <button onClick={() => setShowNewTicket(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary"><X className="w-5 h-5" /></button>
            </div>
            <form
              className="p-8 space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target as HTMLFormElement);
                const data: any = {};
                fd.forEach((value, key) => { data[key] = value; });
                setNewTicketLoading(true);
                try {
                  const res = await fetch(`${API}/crm/committees/${selectedCommittee.id}/tickets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                    body: JSON.stringify(data),
                  });
                  if (res.ok) { setShowNewTicket(false); fetchTickets(); }
                  else { const err = await res.json(); alert(err.error || 'Failed to create ticket'); }
                } finally { setNewTicketLoading(false); }
              }}
            >
              <div>
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Subject Title</label>
                <input name="title" required placeholder="Brief summary of the issue..." className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-rose-500 transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Description</label>
                <textarea name="description" rows={4} placeholder="Detailed description..." className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-rose-500 transition-all resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Priority</label>
                  <select name="priority" className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-rose-500 transition-all">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest mb-2">Category</label>
                  <select name="category" className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-rose-500 transition-all">
                    <option value="support">General Support</option>
                    <option value="billing">Billing</option>
                    <option value="tech">Technical</option>
                    <option value="feedback">Feedback</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-4">
                <button type="button" onClick={() => setShowNewTicket(false)} className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-textSecondary hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={newTicketLoading} className="px-10 py-4 bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-rose-500/25 flex items-center gap-2 disabled:opacity-50">
                  {newTicketLoading ? 'Submitting...' : 'Submit Ticket'}
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Ticket Conversation Modal */}
      {showConversation && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in" onClick={() => setShowConversation(false)}>
          <div className="bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-8 border-b border-white/10 bg-white/5">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">{selectedTicket.title}</h2>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-[10px] text-textSecondary font-black uppercase tracking-widest">Ticket Conversation #{selectedTicket.id}</p>
                  {getPerm('tickets').canDelete && (
                    <button 
                      onClick={() => handleDeleteTicket(selectedTicket.id)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => setShowConversation(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              {/* Original Description */}
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10 border-dashed">
                <p className="text-xs text-textSecondary uppercase font-black tracking-widest mb-3">Original Request</p>
                <p className="text-sm leading-relaxed text-white italic">"{selectedTicket.description}"</p>
              </div>

              {/* Notes/Messages */}
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className={`flex ${note.authorId === user.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl ${note.authorId === user.id ? 'bg-rose-500 text-white rounded-tr-none' : 'bg-white/5 text-white border border-white/10 rounded-tl-none'}`}>
                      <p className="text-sm leading-relaxed">{note.content}</p>
                      <p className="text-[9px] mt-2 opacity-50 uppercase font-black tracking-widest">{new Date(note.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div className="text-center py-10 opacity-20">
                    <p className="text-xs font-black uppercase tracking-widest">No messages yet</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-white/10 bg-white/5">
              <form onSubmit={handleAddNote} className="relative">
                <input 
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Type your message..."
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-6 pr-16 py-4 text-sm focus:outline-none focus:border-rose-500 transition-all"
                />
                <button 
                  type="submit"
                  disabled={noteLoading || !newNote.trim()}
                  className="absolute right-2 top-2 bottom-2 px-4 bg-rose-500 hover:bg-rose-600 rounded-xl transition-all disabled:opacity-50"
                >
                  {noteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Entity Forms */}
      {(showEntityForm === 'planner' || editingPlanner) && (
        <EntityForm
          title={editingPlanner ? 'Edit Milestone' : 'Schedule New Milestone'}
          initialData={editingPlanner || {}}
          fields={[
            { key: 'title', label: 'Event Title', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'eventType', label: 'Event Type', type: 'select', options: [{value: 'meeting', label: 'Meeting'}, {value: 'deadline', label: 'Deadline'}, {value: 'review', label: 'Review'}], required: true },
            { key: 'startDate', label: 'Date', type: 'date', required: true }
          ]}
          onClose={() => { setShowEntityForm(null); setEditingPlanner(null); }}
          onSubmit={handleEntitySubmit}
        />
      )}

      {showEntityForm === 'document' && (
        <EntityForm
          title="Upload Institutional Asset"
          fields={[
            { key: 'title', label: 'Document Title', type: 'text', required: true },
            { key: 'docType', label: 'Document Type', type: 'select', options: [{value: 'contract', label: 'Contract'}, {value: 'report', label: 'Report'}, {value: 'presentation', label: 'Presentation'}, {value: 'other', label: 'Other'}], required: true },
            { key: 'r2Key', label: 'File', type: 'file', required: true, pathPrefix: 'crm-docs' }
          ]}
          onClose={() => setShowEntityForm(null)}
          onSubmit={handleEntitySubmit}
        />
      )}

      <NotificationCenter currentApp="crm" />
    </div>
  );
}
