import { useState, useEffect } from 'react';
import { 
  User, CheckCircle2, Clock, AlertCircle, TrendingUp, 
  BookOpen, Calendar as CalendarIcon, 
  ChevronRight, Plus, StickyNote, Star, Trash2, X,
  Home, Camera
} from 'lucide-react';
import TaskBoard from '../components/TaskBoard';
import CalendarView from '../components/CalendarView';
import ProfileModal from '../components/ProfileModal';
import NotificationCenter from '../components/NotificationCenter';
import EntityForm from '../components/EntityForm';
import MobileTabMenu from '../components/MobileTabMenu';
import Login from './Login';
import { Share2, RefreshCw, Copy, Check, Eye, Edit2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'calendar' | 'committees' | 'appointments' | 'notes'>('overview');
  const [data, setData] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState({ title: '', content: '' });
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [viewingNote, setViewingNote] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [calToken, setCalToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboard();
      fetchNotes();
      fetchCalToken();
    }
  }, [isAuthenticated]);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`${API}/dashboard/me`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const d = await res.json();
      setData(d.data);
      if (d.data?.calendarToken) {
        setCalToken(d.data.calendarToken);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API}/dashboard/notes`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      setNotes(d.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCalToken = async () => {
    try {
      const res = await fetch(`${API}/dashboard/calendar/token`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      setCalToken(d.data?.token || '');
    } catch (err) {
      console.error(err);
    }
  };

  const resetCalToken = async () => {
    if (!confirm('This will invalidate your current calendar URL. Continue?')) return;
    try {
      const res = await fetch(`${API}/dashboard/calendar/token/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      setCalToken(d.data?.token || '');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.title) return;
    try {
      const isEditing = !!editingNote;
      const url = isEditing ? `${API}/dashboard/notes/${editingNote.id}` : `${API}/dashboard/notes`;
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`
        },
        body: JSON.stringify(newNote)
      });
      
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save note');
      
      setNewNote({ title: '', content: '' });
      setShowNoteForm(false);
      setEditingNote(null);
      fetchNotes();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Error saving note');
    }
  };

  const handleEditNote = (note: any) => {
    setEditingNote(note);
    setNewNote({ title: note.title, content: note.content });
    setShowNoteForm(true);
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm('Delete note?')) return;
    try {
      await fetch(`${API}/dashboard/notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` }
      });
      fetchNotes();
    } catch (err) {
      console.error(err);
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <header className="px-4 py-8 md:p-8 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight mb-2">
              Welcome back, <span className="text-primary">{data?.employee?.name || data?.user?.username}</span>
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <p className="text-textSecondary text-sm md:text-base font-medium">Here's what's happening with your assignments today.</p>
              <button
                onClick={() => window.location.href = '/'}
                className="w-fit flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all"
              >
                <Home className="w-3.5 h-3.5" />
                Back to Home
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-4">
            <div className="flex flex-col items-start md:items-end">
              <span className="text-[10px] md:text-xs font-bold text-textSecondary uppercase tracking-widest">Efficiency Score</span>
              <span className="text-2xl md:text-3xl font-black text-primary">{data?.stats?.efficiencyScore || 'N/A'}%</span>
            </div>

            <button 
              onClick={() => setShowProfile(true)}
              className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-1 hover:bg-white/10 transition-all group"
            >
              <div className="w-full h-full rounded-lg md:rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center relative overflow-hidden">
                {data?.user?.profilePhoto ? (
                  <img src={data.user.profilePhoto} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                ) : (
                  <User className="w-6 h-6 md:w-8 md:h-8 text-white group-hover:scale-90 transition-transform" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Navigation Tabs */}
        <MobileTabMenu
          tabs={[
            { id: 'overview', label: 'Overview', icon: TrendingUp },
            { id: 'tasks', label: 'Kanban Board', icon: CheckCircle2 },
            { id: 'calendar', label: 'Schedule', icon: CalendarIcon },
            { id: 'committees', label: 'Committees', icon: BookOpen },
            { id: 'appointments', label: 'Appointments', icon: CalendarIcon },
            { id: 'notes', label: 'Personal Notes', icon: StickyNote },
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as any)}
          accentColor="primary"
        />

        <div className="hidden md:block mb-8 bg-white/5 p-1 rounded-2xl border border-white/10 w-full overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-max">
            {[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'tasks', label: 'Kanban Board', icon: CheckCircle2 },
              { id: 'calendar', label: 'Schedule', icon: CalendarIcon },
              { id: 'committees', label: 'Committees', icon: BookOpen },
              { id: 'appointments', label: 'Appointments', icon: CalendarIcon },
              { id: 'notes', label: 'Personal Notes', icon: StickyNote },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'text-textSecondary hover:text-white hover:bg-white/5'
                  }`}
              >
                <tab.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Tasks', value: data?.stats?.totalTasks, icon: BookOpen, color: 'text-blue-400' },
                { label: 'Completed', value: data?.stats?.completedTasks, icon: CheckCircle2, color: 'text-emerald-400' },
                { label: 'In Progress', value: data?.stats?.inProgressTasks, icon: Clock, color: 'text-amber-400' },
                { label: 'Blocked', value: data?.stats?.blockedTasks, icon: AlertCircle, color: 'text-red-400' },
              ].map((stat, i) => (
                <div key={i} className="glass-panel p-6 rounded-3xl group hover:border-primary/30 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-2xl bg-white/5 ${stat.color}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <ChevronRight className="w-5 h-5 text-textSecondary opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" />
                  </div>
                  <h4 className="text-sm font-bold text-textSecondary mb-1">{stat.label}</h4>
                  <p className="text-3xl font-black">{stat.value || 0}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Quick Tasks */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Active Timeline</h3>
                  <button onClick={() => setActiveTab('calendar')} className="text-sm font-bold text-primary hover:underline">View Calendar</button>
                </div>
                <div className="space-y-3">
                  {data?.tasks?.filter((t: any) => {
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const start = new Date(t.createdAt);
                    start.setHours(0,0,0,0);
                    const end = t.dueDate ? new Date(t.dueDate) : today;
                    end.setHours(0,0,0,0);
                    return today >= start && today <= end;
                  }).slice(0, 5).map((task: any) => (
                    <div key={task.id} className="glass-panel p-5 rounded-2xl flex items-center justify-between hover:bg-white/5 transition-all border border-white/5 group">
                      <div className="flex items-center gap-4">
                        <div className={`w-1 h-10 rounded-full ${task.status === 'completed' ? 'bg-emerald-400' : 'bg-primary'}`} />
                        <div>
                          <h4 className="font-bold text-sm group-hover:text-primary transition-colors">{task.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-textSecondary">{task.department}</span>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Due {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                           task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-textSecondary border-white/10'
                         }`}>{task.status}</span>
                      </div>
                    </div>
                  ))}
                  {(!data?.tasks || data.tasks.length === 0) && (
                    <div className="p-12 text-center text-textSecondary border border-dashed border-white/10 rounded-[2.5rem] bg-white/[0.01]">
                      <p className="text-[10px] font-black uppercase tracking-widest">No active items in timeline today</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-6">
                <div className="glass-panel p-6 rounded-3xl bg-gradient-to-br from-primary/20 to-transparent overflow-hidden">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-primary" /> Active Appointments
                  </h3>
                  <div className="space-y-4">
                    {data?.appointments?.map((appt: any) => (
                      <div key={appt.id} className="text-sm overflow-hidden">
                        <p className="font-bold truncate" title={appt.roleOrTitle}>{appt.roleOrTitle}</p>
                        <p className="text-xs text-textSecondary truncate">
                          {appt.termType} • Starts {appt.appointmentDate}
                        </p>
                        <p className="text-[10px] text-textSecondary/50 font-mono mt-1 break-all">ID: {appt.id}</p>
                      </div>
                    ))}
                    {(!data?.appointments || data.appointments.length === 0) && (
                      <p className="text-sm text-textSecondary italic">No active appointments.</p>
                    )}
                  </div>
                </div>

                <div className="glass-panel p-6 rounded-3xl">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" /> Committees
                  </h3>
                  <div className="space-y-4">
                    {data?.committees?.map((cm: any) => (
                      <div key={cm.committeeId} className="flex items-center justify-between group cursor-pointer">
                        <span className="text-sm group-hover:text-primary transition-colors">{cm.committeeName}</span>
                        <span className="text-[10px] uppercase font-black text-textSecondary px-2 py-0.5 bg-white/5 rounded-md">{cm.roleInCommittee}</span>
                      </div>
                    ))}
                    {(!data?.committees || data.committees.length === 0) && (
                      <p className="text-sm text-textSecondary italic">No committee memberships.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <div className="animate-in fade-in zoom-in-95 duration-700 space-y-6">
            <div className="flex justify-end">
              <button 
                onClick={() => setShowSyncModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group"
              >
                <Share2 className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold">Sync to External Calendar</span>
              </button>
            </div>
            <CalendarView 
              tasks={data?.tasks || []} 
              appointments={data?.appointments || []} 
              onEditTask={(task) => {
                setEditingTask(task);
              }}
              onUpdateTask={async (taskId, updates) => {
                const originalData = data;
                
                if (data && data.tasks) {
                  const updatedTasks = data.tasks.map((task: any) => {
                    if (task.id === taskId) {
                      return {
                        ...task,
                        ...updates,
                      };
                    }
                    return task;
                  });
                  setData({
                    ...data,
                    tasks: updatedTasks,
                  });
                }

                try {
                  const res = await fetch(`${API}/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                    body: JSON.stringify(updates),
                  });
                  if (!res.ok) throw new Error('Failed to update task');
                  fetchDashboard();
                } catch (err) {
                  console.error("Optimistic update failed, rolling back task state", err);
                  setData(originalData);
                  alert('Sync failed: Unable to update task date. Reverting change.');
                }
              }}
            />
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <TaskBoard employeeId={data?.user?.employeeId} accentColor="primary" />
          </div>
        )}

        {/* Committees Tab */}
        {activeTab === 'committees' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {data?.committees?.map((cm: any) => (
              <div key={cm.committeeId} className="glass-panel p-8 rounded-3xl hover:border-primary transition-all relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -mr-16 -mt-16 group-hover:bg-primary/20 transition-all" />
                <h3 className="text-xl font-bold mb-2">{cm.committeeName}</h3>
                <div className="flex items-center gap-2 text-textSecondary text-sm mb-6">
                  <User className="w-4 h-4" />
                  <span>{cm.roleInCommittee}</span>
                </div>
                <button 
                  onClick={() => window.location.href = `/crm?id=${cm.committeeId}`}
                  className="w-full py-3 bg-white/5 hover:bg-primary hover:text-white rounded-2xl text-sm font-bold transition-all"
                >
                  Access Portal
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Appointments Tab */}
        {activeTab === 'appointments' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
            {data?.appointments?.map((appt: any) => (
              <div key={appt.id} className="glass-panel p-8 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="px-3 py-1 bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">Active</div>
                    <span className="text-textSecondary text-xs break-all">ID: {appt.id}</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-1">{appt.roleOrTitle}</h3>
                  <p className="text-textSecondary">{appt.termType} Appointment • Department of {data?.employee?.department || 'Internal'}</p>
                </div>
                <div className="flex items-center gap-8 text-right">
                  <div>
                    <p className="text-xs font-bold text-textSecondary uppercase mb-1">Effective From</p>
                    <p className="text-lg font-bold">{appt.appointmentDate}</p>
                  </div>
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
                    <ChevronRight className="w-6 h-6 text-textSecondary" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold">Personal Workspace</h3>
              <button
                onClick={() => {
                  setEditingNote(null);
                  setNewNote({ title: '', content: '' });
                  setShowNoteForm(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                <Plus className="w-5 h-5" /> New Note
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notes.map((note) => (
                <div key={note.id} className="glass-panel p-6 rounded-3xl group hover:border-white/20 transition-all flex flex-col min-h-[200px]">
                  <div className="flex items-start justify-between mb-4">
                    <h4 className="font-bold text-lg truncate flex-1 mr-2">{note.title}</h4>
                    <div className="flex items-center gap-2">
                      <Star className={`w-4 h-4 ${note.pinned ? 'text-amber-400 fill-amber-400' : 'text-textSecondary'}`} />
                      <button onClick={() => handleDeleteNote(note.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-textSecondary flex-1 line-clamp-3 whitespace-pre-wrap mb-4">{note.content}</p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                    <span className="text-[9px] text-textSecondary uppercase font-bold tracking-widest">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setViewingNote(note)}
                        className="p-2 hover:bg-white/5 rounded-lg text-primary transition-all flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase">View</span>
                      </button>
                      <button 
                        onClick={() => handleEditNote(note)}
                        className="p-2 hover:bg-white/5 rounded-lg text-textSecondary hover:text-white transition-all flex items-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase">Edit</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="col-span-full py-20 text-center glass-panel rounded-3xl border-dashed">
                  <StickyNote className="w-12 h-12 text-textSecondary mx-auto mb-4 opacity-20" />
                  <p className="text-textSecondary">Your workspace is empty. Start by creating a new note.</p>
                </div>
              )}
            </div>

            {/* View Note Modal */}
            {viewingNote && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
                <div className="bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95">
                  <div className="p-8 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black tracking-tight">{viewingNote.title}</h3>
                      <p className="text-[10px] font-black uppercase tracking-widest text-textSecondary mt-1">
                        Last updated {new Date(viewingNote.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          const noteToEdit = viewingNote;
                          setViewingNote(null);
                          handleEditNote(noteToEdit);
                        }}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary hover:text-primary"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => setViewingNote(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-8 overflow-y-auto flex-1 prose prose-invert max-w-none prose-p:text-textSecondary prose-headings:text-white prose-strong:text-primary prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown>{viewingNote.content}</ReactMarkdown>
                  </div>
                  <div className="p-6 bg-white/5 border-t border-white/5 text-center">
                    <button onClick={() => setViewingNote(null)} className="text-xs font-black uppercase tracking-widest text-textSecondary hover:text-white transition-colors">Close Reader</button>
                  </div>
                </div>
              </div>
            )}

            {/* Note Form Modal (Create/Edit) */}
            {showNoteForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-surface border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
                  <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <h3 className="font-bold">{editingNote ? 'Edit Note' : 'Create New Note'}</h3>
                    <button onClick={() => { setShowNoteForm(false); setEditingNote(null); }}><X className="w-5 h-5" /></button>
                  </div>
                  <form onSubmit={handleCreateNote} className="p-6 space-y-4">
                    <input
                      required
                      placeholder="Note Title"
                      value={newNote.title}
                      onChange={e => setNewNote({ ...newNote, title: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
                    />
                    <textarea
                      placeholder="Content (Markdown supported)..."
                      rows={10}
                      value={newNote.content}
                      onChange={e => setNewNote({ ...newNote, content: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none font-mono"
                    />
                    <div className="flex justify-end gap-3 pt-2">
                      <button type="button" onClick={() => { setShowNoteForm(false); setEditingNote(null); }} className="px-6 py-2 text-sm font-bold text-textSecondary">Cancel</button>
                      <button type="submit" className="px-6 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all">
                        {editingNote ? 'Save Changes' : 'Create Note'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black tracking-tight">Sync to External Calendar</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-textSecondary mt-1">Live iCalendar (ICS) Feed</p>
              </div>
              <button onClick={() => setShowSyncModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="p-6 bg-primary/5 border border-primary/20 rounded-3xl space-y-3">
                <div className="flex items-center gap-3 text-primary">
                  <CalendarIcon className="w-5 h-5" />
                  <span className="text-sm font-bold">Auto-Sync Enabled</span>
                </div>
                <p className="text-xs text-textSecondary leading-relaxed">
                  Copy the URL below and paste it into your calendar app (Google Calendar, Outlook, Apple Calendar) to see your GAOS schedule everywhere.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-textSecondary ml-1">Your Unique Feed URL</label>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs font-mono text-primary truncate">
                      {`${window.location.protocol}//${window.location.host}/api/public/calendar/feed/${calToken}.ics`}
                    </div>
                    <button 
                      onClick={() => {
                        const syncUrl = `${window.location.protocol}//${window.location.host}/api/public/calendar/feed/${calToken}.ics`;
                        navigator.clipboard.writeText(syncUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-3 bg-primary text-white rounded-2xl hover:bg-primary/90 transition-all flex items-center justify-center min-w-[50px]"
                    >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button 
                onClick={resetCalToken}
                className="w-full py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-textSecondary hover:text-red-400 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Token
              </button>
            </div>
            <div className="p-6 bg-white/5 border-t border-white/5 text-center">
              <button onClick={() => setShowSyncModal(false)} className="text-xs font-black uppercase tracking-widest text-textSecondary hover:text-white transition-colors">Close Workspace</button>
            </div>
          </div>
        </div>
      )}

      {/* Task Edit Modal */}
      {editingTask && (
        <EntityForm
          title="Edit Task Details"
          initialData={editingTask}
          fields={[
            { key: 'title', label: 'Title', type: 'text', required: true },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'status', label: 'Status', type: 'select', options: [
                { value: 'todo', label: 'To Do' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'completed', label: 'Completed' },
                { value: 'blocked', label: 'Blocked' }
              ], required: true },
            { key: 'priority', label: 'Priority', type: 'select', options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' }
              ], required: true },
            { key: 'startDate', label: 'Start Date', type: 'date' },
            { key: 'dueDate', label: 'Due Date', type: 'date' }
          ]}
          onClose={() => setEditingTask(null)}
          onSubmit={async (data) => {
            try {
              const res = await fetch(`${API}/tasks/${editingTask.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify(data),
              });
              if (!res.ok) throw new Error('Failed to update task');
              setEditingTask(null);
              fetchDashboard();
            } catch (err: any) {
              alert(err.message || 'Error updating task');
            }
          }}
        />
      )}

      {showProfile && (
        <ProfileModal 
          onClose={() => setShowProfile(false)} 
          onUpdate={fetchDashboard}
        />
      )}
      <NotificationCenter currentApp="dashboard" />
    </div>
  );
}
