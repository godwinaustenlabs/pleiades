import { useState, useEffect, useMemo } from 'react';
import {
  Building2, Ticket, CheckCircle2,
  Plus, Search, Filter, MoreHorizontal,
  ChevronRight, Calendar, FileText, LayoutDashboard,
  Shield, ExternalLink, Home, Lock, Loader2, X, Send
} from 'lucide-react';
import TaskBoard from '../components/TaskBoard';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';

interface UserPermission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showConversation, setShowConversation] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);

  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [plannerEvents, setPlannerEvents] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

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
      if (list.length > 0) setSelectedCommittee(list[0]);
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API}/notifications`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setNotifications(d.data || []);
    } catch (err) { }
  };

  const clearNotifications = async () => {
    try {
      await fetch(`${API}/notifications`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      setNotifications([]);
    } catch (err) { }
  };

  useEffect(() => {
    fetchPermissions();
    fetchCommittees();
    fetchNotifications();
  }, []);

  const fetchTickets = async () => {
    if (!selectedCommittee || !getPerm('tickets').canView) return;
    try {
      const res = await fetch(`${API}/crm/committees/${selectedCommittee.id}/tickets`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      setTickets(d.data || []);
    } catch (err) { }
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
    } catch (err) { }
  };

  const fetchDocuments = async () => {
    if (!selectedCommittee) return;
    try {
      const res = await fetch(`${API}/crm/committees/${selectedCommittee.id}/documents`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setDocuments(d.data || []);
    } catch (err) { }
  };

  const fetchNotes = async (ticketId: string) => {
    try {
      const res = await fetch(`${API}/crm/tickets/${ticketId}/notes`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setNotes(d.data || []);
    } catch (err) { }
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
    } catch (err) { }
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
    <div className="flex h-screen bg-black text-white overflow-hidden animate-in fade-in duration-700">
      {/* Sidebar - Committee List */}
      <aside className="w-80 border-r border-white/10 bg-white/5 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight">GAnova<span className="text-rose-500">CRM</span></h1>
              <p className="text-[10px] uppercase font-black text-rose-500 tracking-widest leading-none">Unified Committees</p>
            </div>
            <button onClick={() => window.location.href = '/'} className="ml-auto p-2 text-textSecondary hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all">
              <Home className="w-5 h-5" />
            </button>
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
            .filter(c => c.committeeName?.toLowerCase().includes(committeeSearch.toLowerCase()))
            .map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCommittee(c)}
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
          <header className="p-8 pb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="px-3 py-1 bg-rose-500/10 text-rose-500 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-500/20">Operational Instance</div>
                <span className="text-textSecondary text-[10px] font-mono tracking-tighter">REF: {selectedCommittee.id}</span>
              </div>
              <h2 className="text-4xl font-black tracking-tight">{selectedCommittee.committeeName}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all text-textSecondary hover:text-white">
                <ExternalLink className="w-5 h-5" />
              </button>
              {getPerm('tickets').canEdit && (
                <button
                  onClick={() => setShowNewTicket(true)}
                  className="px-6 py-3 bg-rose-500 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> New Ticket
                </button>
              )}
            </div>
          </header>

          <nav className="px-8 flex items-center gap-2 border-b border-white/10">
            {TABS.map((tab) => (
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

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-sm uppercase tracking-widest text-textSecondary">Notifications</h3>
                      <div className="flex gap-4">
                        {getPerm('tickets').canEdit && (
                          <button 
                            onClick={() => {
                              const title = prompt('Notification Title:');
                              const message = prompt('Notification Message:');
                              if (title && message) {
                                fetch(`${API}/notifications/send`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                  body: JSON.stringify({ userId: user.id, title, message, type: 'manual' })
                                }).then(() => fetchNotifications());
                              }
                            }}
                            className="text-[10px] font-black uppercase text-emerald-500 hover:text-emerald-400"
                          >
                            Broadcast Alert
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button onClick={clearNotifications} className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-400">Clear All</button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {notifications.map((n) => (
                        <div key={n.id} className="glass-panel p-4 rounded-2xl border border-white/10 flex gap-4 items-start bg-white/[0.01]">
                          <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 flex-shrink-0 animate-pulse" />
                          <div>
                            <p className="text-xs font-bold text-white mb-1">{n.title}</p>
                            <p className="text-[11px] text-textSecondary leading-relaxed">{n.message}</p>
                            <p className="text-[9px] text-textSecondary mt-2 uppercase font-black">{new Date(n.createdAt).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      ))}
                      {notifications.length === 0 && (
                        <div className="p-8 text-center glass-panel rounded-2xl border-white/5 opacity-40">
                          <p className="text-[10px] font-black uppercase tracking-widest">No new alerts</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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

            {activeTab === 'tasks' && (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <TaskBoard committeeId={selectedCommittee.id} accentColor="rose-500" canEdit={getPerm('tasks').canEdit} />
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black tracking-tight">Institutional Assets</h3>
                  {getPerm('documents').canEdit && (
                    <button className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border border-white/10 shadow-xl">
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
                      <a href={`https://office.galabs.workers.dev/api/assets/view/${doc.r2Key}`} target="_blank" rel="noreferrer" className="mt-4 block text-center py-2 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">View Asset</a>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <div className="col-span-full py-12 text-center opacity-20 italic text-sm">No institutional assets found.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'planner' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black tracking-tight">Committee Planner</h3>
                  {getPerm('planner').canEdit && (
                    <button className="px-6 py-3 bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20">
                      New Event
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  {plannerEvents.map(evt => (
                    <div key={evt.id} className="glass-panel p-6 rounded-3xl border border-white/10 flex items-center justify-between group hover:border-rose-500/30 transition-all">
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
                      <ChevronRight className="w-5 h-5 text-textSecondary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
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
          <div className="bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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
                <p className="text-[10px] text-textSecondary font-black uppercase tracking-widest mt-1">Ticket Conversation #{selectedTicket.id}</p>
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
    </div>
  );
}
