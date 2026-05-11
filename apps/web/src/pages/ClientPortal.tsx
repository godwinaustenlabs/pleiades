import { useState, useEffect } from 'react';
import { 
  Shield, Ticket, AlertCircle, Send, LogOut, 
  MessageSquare, Building2, ChevronRight
} from 'lucide-react';

const API = '/api';

export default function ClientPortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('ganova_client_token'));
  const [loading, setLoading] = useState(false);
  const [clientData, setClientData] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [committees, setCommittees] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'tickets' | 'new_ticket'>('tickets');
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoggedIn) {
      fetchClientData();
      fetchTickets();
      fetchCommittees();
    }
  }, [isLoggedIn]);

  const fetchClientData = async () => {
    try {
      const res = await fetch(`${API}/portal/whoami`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('ganova_client_token')}` }
      });
      if (res.ok) {
        const d = await res.json();
        setClientData(d.data);
      } else {
        handleLogout();
      }
    } catch (err) { console.error(err); }
  };

  const fetchTickets = async () => {
    try {
      const res = await fetch(`${API}/portal/tickets`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('ganova_client_token')}` }
      });
      const d = await res.json();
      setTickets(d.data || []);
    } catch (err) { console.error(err); }
  };

  const fetchCommittees = async () => {
    try {
      const res = await fetch(`${API}/portal/committees`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('ganova_client_token')}` }
      });
      const d = await res.json();
      setCommittees(d.data || []);
    } catch (err) { console.error(err); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const d = await res.json();
      if (res.ok) {
        localStorage.setItem('ganova_client_token', d.data.token);
        setIsLoggedIn(true);
      } else {
        setError(d.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ganova_client_token');
    setIsLoggedIn(false);
    setClientData(null);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const data = Object.fromEntries((formData as any).entries());

    try {
      const res = await fetch(`${API}/portal/tickets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('ganova_client_token')}` 
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setActiveTab('tickets');
        fetchTickets();
        form.reset();
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-center mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-2xl shadow-indigo-500/20">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight italic">GAnova<span className="text-indigo-500">Portal</span></h1>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-slate-400 text-sm mb-8 font-medium">Please sign in to access your committee resources.</p>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-bold flex items-center gap-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Email Address</label>
                <input 
                  type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Security Key</label>
                <input 
                  type="password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>
              <button 
                type="submit" disabled={loading}
                className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
              >
                {loading ? 'Authenticating...' : 'Sign In To Portal'}
                {!loading && <ChevronRight className="w-5 h-5" />}
              </button>
            </form>
          </div>
          
          <p className="text-center mt-10 text-slate-500 text-xs font-medium">
            Authorized Personnel Only. © 2026 GAnova Labs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col">
      {/* Client Header */}
      <nav className="border-b border-white/5 bg-slate-950/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
             </div>
             <div className="flex flex-col">
                <h1 className="font-black text-lg leading-tight tracking-tight italic">GAnova<span className="text-indigo-500">Portal</span></h1>
                <span className="text-[10px] uppercase font-black text-indigo-400 tracking-widest">Global Operations</span>
             </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-xs font-bold text-white">{clientData?.name || 'Authorized Client'}</span>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{clientData?.companyName || 'Corporate Partner'}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2.5 bg-white/5 hover:bg-red-500/10 hover:text-red-400 rounded-xl border border-white/10 transition-all group"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12">
        <div className="flex flex-col md:flex-row gap-12">
          
          {/* Main Dashboard */}
          <div className="flex-1 space-y-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black mb-2 tracking-tight">Your Support Hub</h2>
                <p className="text-slate-400 font-medium text-sm">Track your tickets and communicate with our expert teams.</p>
              </div>
              <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
                <button 
                  onClick={() => setActiveTab('tickets')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'tickets' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
                >
                  My Tickets
                </button>
                <button 
                  onClick={() => setActiveTab('new_ticket')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'new_ticket' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
                >
                  Raise Ticket
                </button>
              </div>
            </div>

            {/* Content Tabs */}
            {activeTab === 'tickets' && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {tickets.map(t => (
                  <div key={t.id} className="bg-white/5 border border-white/10 rounded-[2rem] p-8 hover:border-indigo-500/30 transition-all group">
                    <div className="flex items-start justify-between mb-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            t.status === 'open' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/20' : 
                            t.status === 'closed' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/20' : 
                            'bg-emerald-500/20 text-emerald-500 border border-emerald-500/20'
                          }`}>
                            {t.status === 'open' ? 'Awaiting Expert' : t.status === 'in_progress' ? 'Under Review' : t.status}
                          </span>
                          <span className="text-slate-500 text-[10px] font-black">REF: {t.id}</span>
                        </div>
                        <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">{t.title}</h3>
                      </div>
                      <div className="text-right">
                         <p className="text-xs font-bold text-white">Priority: <span className={t.priority === 'urgent' ? 'text-red-400' : 'text-indigo-400'}>{t.priority}</span></p>
                         <p className="text-[10px] text-slate-500 font-black mt-1 uppercase tracking-widest">{new Date(t.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <p className="text-slate-400 text-sm leading-relaxed mb-8 line-clamp-3 font-medium">{t.description || 'No additional details provided.'}</p>
                    <div className="flex items-center justify-between pt-6 border-t border-white/5">
                      <div className="flex -space-x-2">
                        <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-indigo-500 flex items-center justify-center text-[10px] font-black">GA</div>
                        <div className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-black">?</div>
                      </div>
                      <button className="flex items-center gap-2 text-xs font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors">
                        View Progress <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {tickets.length === 0 && (
                  <div className="py-24 text-center bg-white/5 border border-dashed border-white/10 rounded-[2rem]">
                    <Ticket className="w-16 h-16 text-slate-800 mx-auto mb-6" />
                    <h3 className="text-lg font-bold text-white mb-2">No active tickets</h3>
                    <p className="text-slate-500 max-w-xs mx-auto text-sm font-medium">You don't have any support tickets open at the moment. Raise one if you need assistance.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'new_ticket' && (
              <div className="animate-in fade-in zoom-in-95 duration-500">
                <div className="bg-white/5 border border-white/10 rounded-[2rem] p-10 backdrop-blur-xl">
                  <h3 className="text-2xl font-bold mb-8">Raise a Service Ticket</h3>
                  <form onSubmit={handleCreateTicket} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Subject Title</label>
                          <input 
                             name="title" required
                             placeholder="Brief summary of your request"
                             className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                          />
                       </div>
                       <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Select Committee</label>
                          <select 
                             name="committeeId" required
                             className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all appearance-none"
                          >
                             <option value="">Select Committee...</option>
                             {committees.map(c => (
                               <option key={c.id} value={c.id}>{c.committeeName}</option>
                             ))}
                          </select>
                       </div>
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Detailed Description</label>
                       <textarea 
                          name="description" rows={6}
                          placeholder="Please provide as much detail as possible..."
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all resize-none"
                       />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Priority Level</label>
                          <select 
                             name="priority"
                             className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                          >
                             <option value="low">Low - General Inquiry</option>
                             <option value="medium">Medium - Standard Request</option>
                             <option value="high">High - Urgent Action Needed</option>
                             <option value="urgent">Urgent - Mission Critical</option>
                          </select>
                       </div>
                       <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Category</label>
                          <select 
                             name="category"
                             className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                          >
                             <option value="support">General Support</option>
                             <option value="billing">Billing & Finance</option>
                             <option value="tech">Technical Issue</option>
                             <option value="feedback">Feedback/Suggestion</option>
                          </select>
                       </div>
                    </div>
                    <div className="pt-6 flex justify-end">
                       <button 
                          type="submit" disabled={loading}
                          className="px-12 py-4 bg-indigo-500 hover:bg-indigo-600 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2 disabled:opacity-50"
                       >
                          {loading ? 'Submitting...' : 'Submit Service Ticket'}
                          <Send className="w-5 h-5" />
                       </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-full md:w-80 space-y-8">
             <div className="bg-indigo-500 rounded-[2rem] p-8 text-white shadow-2xl shadow-indigo-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl -mr-16 -mt-16 group-hover:bg-white/20 transition-all" />
                <h3 className="text-xl font-black mb-2">Need Direct Help?</h3>
                <p className="text-indigo-100 text-xs font-medium mb-6 leading-relaxed">Our premium support team is available 24/7 for mission-critical issues.</p>
                <button className="w-full py-3 bg-white text-indigo-500 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all">
                   Live Chat
                </button>
             </div>

             <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8">
                <h3 className="font-bold text-white mb-6 flex items-center gap-2">
                   <Building2 className="w-4 h-4 text-indigo-400" /> My Committees
                </h3>
                <div className="space-y-4">
                   {committees.map(c => (
                      <div key={c.id} className="p-4 bg-black/20 rounded-2xl border border-white/5 group hover:border-indigo-500/30 transition-all cursor-pointer">
                         <p className="text-xs font-bold text-white truncate">{c.committeeName}</p>
                         <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{c.opsStatus || 'Active'}</p>
                            <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                         </div>
                      </div>
                   ))}
                   {committees.length === 0 && (
                      <p className="text-xs text-slate-500 italic text-center py-4">No active committee links.</p>
                   )}
                </div>
             </div>

             <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8">
                <h3 className="font-bold text-white mb-6 flex items-center gap-2">
                   <MessageSquare className="w-4 h-4 text-indigo-400" /> Notifications
                </h3>
                <div className="space-y-6">
                   <div className="flex gap-4">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                      <div>
                         <p className="text-xs font-medium text-slate-300 leading-relaxed">Your ticket <span className="text-indigo-400 font-bold">#TKT-9122</span> has been assigned to an expert.</p>
                         <p className="text-[10px] text-slate-500 font-black mt-1 uppercase">2 hours ago</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>

        </div>
      </main>

      <footer className="py-10 border-t border-white/5">
         <div className="max-w-6xl mx-auto px-6 text-center">
            <div className="flex justify-center mb-6">
               <div className="flex items-center gap-2 opacity-50">
                  <Shield className="w-5 h-5 text-indigo-500" />
                  <span className="text-sm font-black italic tracking-tight">GAnova<span className="text-indigo-500">Portal</span></span>
               </div>
            </div>
            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">
               Secure Access Environment • End-to-End Encryption Enabled
            </p>
         </div>
      </footer>
    </div>
  );
}
