import React, { useState, useEffect } from 'react';
import { User, Key, Save, X, CheckCircle, AlertCircle, Loader2, Camera } from 'lucide-react';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';

interface ProfileModalProps {
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ProfileModal({ onClose, onUpdate }: ProfileModalProps) {
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '', confirmPassword: '', profilePhoto: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  // Cropping states
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetch(`${API}/auth/profile`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setForm(f => ({ 
            ...f, 
            name: data.data.name || '', 
            username: data.data.username || '',
            email: data.data.email || '',
            phone: data.data.phone || '',
            profilePhoto: data.data.profilePhoto || ''
          }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.password && form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API}/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`
        },
        body: JSON.stringify({
          name: form.name,
          username: form.username,
          email: form.email,
          phone: form.phone,
          ...(form.password ? { password: form.password } : {})
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update profile');
      } else {
        const localUser = JSON.parse(localStorage.getItem('ga_user') || '{}');
        localStorage.setItem('ga_user', JSON.stringify({
          ...localUser,
          name: form.name,
          username: form.username
        }));
        
        setSuccess('Profile updated successfully');
        if (onUpdate) onUpdate();
        setForm(f => ({ ...f, password: '', confirmPassword: '' }));
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <User className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Profile Settings</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-textSecondary" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-textSecondary">Loading profile...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Profile Picture Section */}
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full border-2 border-primary/30 p-1 bg-white/5 overflow-hidden">
                    {form.profilePhoto ? (
                      <img src={form.profilePhoto.startsWith('http') ? form.profilePhoto : `${API}${form.profilePhoto.startsWith('/') ? '' : '/'}${form.profilePhoto}`} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                        <User className="w-10 h-10 text-primary opacity-50" />
                      </div>
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full cursor-pointer hover:bg-primary/90 shadow-lg transition-transform hover:scale-110">
                    <Camera className="w-4 h-4" />
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setRawImage(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">Profile Picture</p>
                  <p className="text-[10px] text-textSecondary uppercase tracking-widest mt-1">PNG, JPG or GIF up to 5MB</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}
              {success && <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-400">{success}</div>}

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-1.5 ml-1">Full Name</label>
                <input type="text" placeholder="Your Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-1.5 ml-1">Username</label>
                <input type="text" placeholder="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-1.5 ml-1">Email</label>
                <input type="email" placeholder="email@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-1.5 ml-1">Phone Number</label>
                <input type="text" placeholder="+1 (555) 000-0000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors" />
              </div>

              <div className="pt-4 border-t border-white/5 mt-4 flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-0.5 ml-1 flex items-center gap-2">Application Theme</label>
                  <p className="text-[10px] text-textSecondary ml-1">Toggle light/dark mode</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newTheme = theme === 'dark' ? 'light' : 'dark';
                    setTheme(newTheme);
                    localStorage.setItem('theme', newTheme);
                    if (newTheme === 'dark') document.documentElement.classList.add('dark');
                    else document.documentElement.classList.remove('dark');
                  }}
                  className={`w-12 h-6 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-primary' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${theme === 'dark' ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="pt-2 border-t border-white/5 mt-4">
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
                  <Key className="w-3 h-3" /> Change Password
                </label>
                <div className="space-y-3">
                  <input type="password" placeholder="New Password (min 8 chars)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm" />
                  <input type="password" placeholder="Confirm New Password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm" />
                </div>
              </div>

              <div className="pt-4">
                <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {rawImage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg space-y-6" onClick={e => e.stopPropagation()}>
            <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-3xl border border-white/10 bg-black overflow-hidden cursor-move"
              onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y }); }}
              onMouseMove={(e) => { if (isDragging) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              <img 
                src={rawImage} 
                className="absolute transition-transform duration-75 select-none"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: 'center' }}
                onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    setZoom(Math.max(320 / img.naturalWidth, 320 / img.naturalHeight));
                }}
                draggable={false}
              />
              <div className="absolute inset-0 pointer-events-none ring-[100px] ring-black/60 rounded-full border-2 border-primary" />
            </div>

            <div className="px-8 space-y-4">
                <input type="range" min="0.5" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-full accent-primary" />
                <div className="flex gap-4">
                    <button onClick={() => setRawImage(null)} className="flex-1 py-3 bg-white/5 rounded-2xl text-sm font-bold">Cancel</button>
                    <button onClick={async () => {
                        setUploading(true);
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = 400; canvas.height = 400;
                            const ctx = canvas.getContext('2d')!;
                            const img = new Image();
                            img.src = rawImage!;
                            await new Promise(r => img.onload = r);
                            ctx.fillStyle = 'white'; ctx.fillRect(0,0,400,400);
                            ctx.drawImage(img, (400/2) - (img.naturalWidth * zoom / 2) + offset.x, (400/2) - (img.naturalHeight * zoom / 2) + offset.y, img.naturalWidth * zoom, img.naturalHeight * zoom);
                            const blob = await new Promise<Blob|null>(r => canvas.toBlob(r, 'image/jpeg', 0.9));
                            if (blob) {
                                const formData = new FormData(); formData.append('file', blob, 'avatar.jpg');
                                const res = await fetch(`${API}/auth/profile/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: formData });
                                const d = await res.json();
                                if (d.success) { 
                                    setForm(f => ({ ...f, profilePhoto: `${d.data.avatarUrl}?t=${Date.now()}` })); 
                                    setRawImage(null); 
                                }
                            }
                        } catch (e) {
                            console.error("Save error:", e);
                        } finally { setUploading(false); }
                    }} className="flex-1 py-3 bg-primary text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
                        {uploading ? <Loader2 className="animate-spin" /> : 'Save Photo'}
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
