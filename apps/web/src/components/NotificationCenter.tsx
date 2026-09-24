import { useState, useEffect } from 'react';
import { Bell, Send, Info, X, MessageSquare, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { token } from '../lib/auth';

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
    <div className="relative">
      {/* Toggle. It lives in the page header now. As a floating action button
          pinned to the bottom-right corner it sat on top of whatever was
          underneath it — most often the Save button of a form or the last row
          of a table — on every page and at every width. A header button cannot
          overlap content, and it is in the same place on a phone and on a
          desktop. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={isOpen}
        className={`relative rounded-xl p-2 transition-all md:p-2.5 ${
          isOpen ? 'bg-primary/15 text-primary' : 'text-textSecondary hover:bg-white/10 hover:text-textPrimary'
        }`}
      >
        <Bell className="h-4 w-4 md:h-5 md:w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-black leading-none text-onScrim">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Click-away. Transparent, and below the panel. */}
          <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} aria-hidden="true" />
          {/* Anchored under the bell on desktop; a full-width card under the
              header on a phone, where 24rem would not fit beside it. */}
          <div
            data-notification-panel
            /* `modal-panel` (opaque) rather than one of the glass surfaces: the
               panel is a child of the header, and the header already has a
               `backdrop-filter`. A nested backdrop-filter has no page content
               left to sample, so a translucent panel here does not blur what is
               behind it — it simply lets the page show through, and the form
               underneath was legible straight through the notification list. */
            className="modal-panel fixed inset-x-2 top-[4.5rem] z-[95] flex max-h-[72dvh] flex-col overflow-hidden rounded-[1.75rem] shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:max-h-[600px] md:w-96"
          >
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
                    <div key={msg.id} className={`p-4 rounded-2xl border transition-all ${msg.isResolved ? 'bg-surfaceAlt border-white/5 opacity-60' : 'bg-white/5 border-white/10 hover:border-primary/30 shadow-lg'}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          {msg.type === 'flag' ? <AlertTriangle className="w-3.5 h-3.5 text-danger" /> : msg.type === 'request' ? <Send className="w-3.5 h-3.5 text-info" /> : <Info className="w-3.5 h-3.5 text-success" />}
                          <span className={`text-[9px] font-black uppercase tracking-widest ${msg.type === 'flag' ? 'text-danger' : 'text-primary'}`}>{msg.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-textSecondary uppercase tracking-widest">From {msg.senderApp}</span>
                          <button onClick={() => handleDelete(msg.id)} className="p-1 text-textSecondary hover:text-danger hover:bg-danger/10 rounded-md transition-colors">
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
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  className="w-full py-3 md:py-4 bg-primary text-surface text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Dispatch Message'}
                </button>
              </form>
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
