import { useState, useEffect } from 'react';
import { Bell, Send, Info, X, MessageSquare, AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface NotificationCenterProps {
  currentApp: string; // 'hr', 'finance', 'legal', etc.
}

export default function NotificationCenter({ currentApp }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'inbox' | 'compose'>('inbox');
  const [unreadCount, setUnreadCount] = useState(0);

  // Form state
  const [targetApp, setTargetApp] = useState('');
  const [msgType, setMsgType] = useState('notification');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const API = '/api';
  const token = () => localStorage.getItem('ga_token') || '';

  const APPS = [
    { id: 'hr', label: 'HR' },
    { id: 'finance', label: 'Finance' },
    { id: 'legal', label: 'Legal' },
    { id: 'tech', label: 'Tech' },
    { id: 'ops', label: 'Operations' },
    { id: 'acquisition', label: 'Acquisition' },
    { id: 'crm', label: 'CRM' },
    { id: 'all', label: 'All Departments' }
  ].filter(a => a.id !== currentApp);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/messages?app=${currentApp}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      const msgs = d.data || [];
      setMessages(msgs);
      setUnreadCount(msgs.filter((m: any) => !m.isResolved).length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, [currentApp]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch(`${API}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          senderApp: currentApp,
          targetApp,
          type: msgType,
          title,
          message,
          priority: msgType === 'flag' ? 'high' : 'medium'
        })
      });
      if (res.ok) {
        setTab('inbox');
        setTitle('');
        setMessage('');
        setTargetApp('');
        fetchMessages();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await fetch(`${API}/messages/${id}/resolve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token()}` }
      });
      fetchMessages();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this notification?')) return;
    try {
      await fetch(`${API}/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` }
      });
      fetchMessages();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[100] flex flex-col items-end">
      {/* Panel */}
      {isOpen && (
        <div className="mb-4 w-[calc(100vw-2rem)] sm:w-96 max-h-[calc(100vh-8rem)] md:max-h-[600px] flex flex-col glass-panel rounded-[2rem] border border-white/20 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="p-4 md:p-6 bg-white/5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/20">
                <Bell className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-xs md:text-sm font-black uppercase tracking-widest text-white">Ops Center</h3>
                <p className="text-[9px] md:text-[10px] text-textSecondary font-bold">Cross-App Hub</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <X className="w-5 h-5 text-textSecondary" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button 
              onClick={() => setTab('inbox')}
              className={`flex-1 py-3 md:py-4 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-all ${tab === 'inbox' ? 'text-primary bg-primary/5' : 'text-textSecondary hover:text-white'}`}
            >
              Requests ({unreadCount})
            </button>
            <button 
              onClick={() => setTab('compose')}
              className={`flex-1 py-3 md:py-4 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-all ${tab === 'compose' ? 'text-primary bg-primary/5' : 'text-textSecondary hover:text-white'}`}
            >
              Compose
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
            {tab === 'inbox' ? (
              <>
                {loading && messages.length === 0 ? (
                  <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-10 h-10 md:w-12 md:h-12 text-white/5 mx-auto mb-4" />
                    <p className="text-[10px] md:text-xs text-textSecondary italic">No messages for this department.</p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} className={`p-4 rounded-2xl border transition-all ${msg.isResolved ? 'bg-black/20 border-white/5 opacity-60' : 'bg-white/5 border-white/10 hover:border-primary/30 shadow-lg'}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          {msg.type === 'flag' ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> : msg.type === 'request' ? <Send className="w-3.5 h-3.5 text-blue-400" /> : <Info className="w-3.5 h-3.5 text-emerald-400" />}
                          <span className={`text-[9px] font-black uppercase tracking-widest ${msg.type === 'flag' ? 'text-red-400' : 'text-primary'}`}>{msg.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-textSecondary uppercase tracking-widest">From {msg.senderApp}</span>
                          <button onClick={() => handleDelete(msg.id)} className="p-1 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h4 className="text-xs font-black text-white mb-1">{msg.title}</h4>
                      <p className="text-[11px] text-textSecondary leading-relaxed mb-3 break-words">{msg.message}</p>
                      {!msg.isResolved && (
                        <button 
                          onClick={() => handleResolve(msg.id)}
                          className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-primary/20"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  ))
                )}
              </>
            ) : (
              <form onSubmit={handleSend} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-textSecondary">Target Department</label>
                  <select 
                    required
                    value={targetApp}
                    onChange={e => setTargetApp(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-primary/50"
                  >
                    <option value="">Select Dept...</option>
                    {APPS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-textSecondary">Message Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['notification', 'request', 'flag'].map(t => (
                      <button 
                        key={t} type="button" onClick={() => setMsgType(t)}
                        className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${msgType === t ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-white/5 border-white/10 text-textSecondary'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-textSecondary">Subject</label>
                  <input 
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Brief summary..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-primary/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-textSecondary">Message</label>
                  <textarea 
                    required
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Describe your request or flag..."
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={sending || !targetApp}
                  className="w-full py-3 md:py-4 bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Dispatch Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Toggle */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all shadow-2xl relative ${isOpen ? 'bg-white text-black' : 'bg-primary text-white hover:scale-105 active:scale-95 shadow-primary/30'}`}
      >
        {isOpen ? <X className="w-6 h-6 md:w-7 md:h-7" /> : <Bell className="w-6 h-6 md:w-7 md:h-7" />}
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 md:w-6 md:h-6 bg-red-500 text-white text-[9px] md:text-[10px] font-black rounded-full border-2 md:border-4 border-background flex items-center justify-center animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
