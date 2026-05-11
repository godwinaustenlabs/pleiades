import { useState, useEffect } from 'react';
import { 
  User, CheckCircle2, Clock, AlertCircle, TrendingUp, 
  BookOpen, Calendar as CalendarIcon, 
  ChevronRight, Plus, StickyNote, Star, Trash2, X,
  Home
} from 'lucide-react';
import TaskBoard from '../components/TaskBoard';
import ProfileModal from '../components/ProfileModal';
import Login from './Login';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'committees' | 'appointments' | 'notes'>('overview');
  const [data, setData] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState({ title: '', content: '' });
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboard();
      fetchNotes();
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

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.title) return;
    try {
      await fetch(`${API}/dashboard/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`
        },
        body: JSON.stringify(newNote)
      });
      setNewNote({ title: '', content: '' });
      setShowNoteForm(false);
      fetchNotes();
    } catch (err) {
      console.error(err);
    }
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
      <header className="p-8 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight mb-2">
              Welcome back, <span className="text-primary">{data?.employee?.name || data?.user?.username}</span>
            </h1>
            <div className="flex items-center gap-4">
              <p className="text-textSecondary font-medium">Here's what's happening with your assignments today.</p>
              <button 
                onClick={() => window.location.href = '/'}
                className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all"
              >
                <Home className="w-3.5 h-3.5" />
                Back to Home
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-textSecondary uppercase tracking-widest">Efficiency Score</span>
              <span className="text-3xl font-black text-primary">{data?.stats?.efficiencyScore || 'N/A'}%</span>
            </div>
            <button 
              onClick={() => setShowProfile(true)}
              className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-1 hover:bg-white/10 transition-all group"
            >
              <div className="w-full h-full rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center relative">
                <User className="w-8 h-8 text-white group-hover:scale-90 transition-transform" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus className="w-4 h-4 rotate-45" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mb-8 bg-white/5 p-1.5 rounded-2xl border border-white/10 w-fit">
          {[
            { id: 'overview', label: 'Overview', icon: TrendingUp },
            { id: 'tasks', label: 'My Tasks', icon: CheckCircle2 },
            { id: 'committees', label: 'Committees', icon: BookOpen },
            { id: 'appointments', label: 'Appointments', icon: CalendarIcon },
            { id: 'notes', label: 'Personal Notes', icon: StickyNote },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'text-textSecondary hover:text-white hover:bg-white/5'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
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
                  <h3 className="text-xl font-bold">Recent Assignments</h3>
                  <button onClick={() => setActiveTab('tasks')} className="text-sm font-bold text-primary hover:underline">View All</button>
                </div>
                <div className="space-y-3">
                  {data?.tasks?.slice(0, 5).map((task: any) => (
                    <div key={task.id} className="glass-panel p-4 rounded-2xl flex items-center justify-between hover:bg-white/5 transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-12 rounded-full ${task.status === 'completed' ? 'bg-emerald-500' : 'bg-primary'}`} />
                        <div>
                          <h4 className="font-bold text-sm">{task.title}</h4>
                          <p className="text-xs text-textSecondary">{task.department} • {task.status}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-textSecondary bg-white/5 px-2 py-1 rounded-lg">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {(!data?.tasks || data.tasks.length === 0) && (
                    <div className="p-12 text-center text-textSecondary border border-dashed border-white/10 rounded-3xl">
                      No active tasks found.
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-6">
                <div className="glass-panel p-6 rounded-3xl bg-gradient-to-br from-primary/20 to-transparent">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-primary" /> Active Appointments
                  </h3>
                  <div className="space-y-4">
                    {data?.appointments?.map((appt: any) => (
                      <div key={appt.id} className="text-sm">
                        <p className="font-bold">{appt.roleOrTitle}</p>
                        <p className="text-xs text-textSecondary">{appt.termType} • Starts {appt.appointmentDate}</p>
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
                <button className="w-full py-3 bg-white/5 hover:bg-primary hover:text-white rounded-2xl text-sm font-bold transition-all">
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
                    <span className="text-textSecondary text-xs">ID: {appt.id}</span>
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
                onClick={() => setShowNoteForm(true)}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                <Plus className="w-5 h-5" /> New Note
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notes.map((note) => (
                <div key={note.id} className="glass-panel p-6 rounded-3xl group hover:border-white/20 transition-all flex flex-col min-h-[200px]">
                  <div className="flex items-start justify-between mb-4">
                    <h4 className="font-bold text-lg">{note.title}</h4>
                    <div className="flex items-center gap-2">
                      <Star className={`w-4 h-4 ${note.pinned ? 'text-amber-400 fill-amber-400' : 'text-textSecondary'}`} />
                      <button onClick={() => handleDeleteNote(note.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-textSecondary flex-1 line-clamp-4 whitespace-pre-wrap">{note.content}</p>
                  <div className="mt-6 pt-4 border-t border-white/5 text-[10px] text-textSecondary uppercase font-bold tracking-widest">
                    Last updated {new Date(note.updatedAt).toLocaleDateString()}
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

            {showNoteForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-surface border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <h3 className="font-bold">Create New Note</h3>
                    <button onClick={() => setShowNoteForm(false)}><X className="w-5 h-5" /></button>
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
                      placeholder="Content..."
                      rows={6}
                      value={newNote.content}
                      onChange={e => setNewNote({ ...newNote, content: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none"
                    />
                    <div className="flex justify-end gap-3 pt-2">
                      <button type="button" onClick={() => setShowNoteForm(false)} className="px-6 py-2 text-sm font-bold text-textSecondary">Cancel</button>
                      <button type="submit" className="px-6 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all">Save Note</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showProfile && (
        <ProfileModal 
          onClose={() => setShowProfile(false)} 
          onUpdate={fetchDashboard}
        />
      )}
    </div>
  );
}
