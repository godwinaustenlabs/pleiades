import React, { useState, useEffect } from 'react';
import { User, Key, Save, X, Loader2, Camera, Sun, Moon, Monitor } from 'lucide-react';
import CropModal from './CropModal';
import { API, token } from '../lib/auth';
import { errorMessage } from '../lib/errors';


interface ProfileModalProps {
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ProfileModal({ onClose, onUpdate }: ProfileModalProps) {
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '', confirmPassword: '', profilePhoto: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');

  // Cropping state
  const [rawImage, setRawImage] = useState<string | null>(null);

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

  const getProfileUrl = (url: string) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('/api')) return url;
    return `/api/assets/download/${url.startsWith('/') ? url.slice(1) : url}`;
  };

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
        const updatedUser = {
          ...localUser,
          name: form.name,
          username: form.username
        };
        localStorage.setItem('ga_user', JSON.stringify(updatedUser));
        
        // Broadcast the change for other components
        window.dispatchEvent(new Event('ga_user_updated'));
        
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

  const handleSaveCrop = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', blob, 'avatar.jpg');
      
      const res = await fetch(`${API}/auth/profile/avatar`, { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${token()}` }, 
        body: formData 
      });
      
      const d = await res.json();
      if (d.success) { 
        const finalUrl = `${d.data.avatarUrl}?t=${Date.now()}`;
        setForm(f => ({ ...f, profilePhoto: finalUrl })); 
        
        const localUser = JSON.parse(localStorage.getItem('ga_user') || '{}');
        const updatedUser = {
            ...localUser,
            profilePhoto: finalUrl
        };
        localStorage.setItem('ga_user', JSON.stringify(updatedUser));
        
        // Broadcast the change
        window.dispatchEvent(new Event('ga_user_updated'));
        setRawImage(null); 
      } else {
        throw new Error(d.error || 'Failed to upload photo');
      }
    } catch (e) {
      setError(errorMessage(e, "Save error"));
      throw e;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
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
                      <img 
                        src={getProfileUrl(form.profilePhoto)!} 
                        alt="Avatar" 
                        className="w-full h-full rounded-full object-cover" 
                      />
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
                          // Reset input so same file can be selected again
                          e.target.value = '';
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
                  <p className="text-[10px] text-textSecondary ml-1">Choose your appearance preference</p>
                </div>
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                  {[
                    { id: 'light', icon: Sun, label: 'Light' },
                    { id: 'system', icon: Monitor, label: 'System' },
                    { id: 'dark', icon: Moon, label: 'Dark' }
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setTheme(option.id);
                        localStorage.setItem('theme', option.id);
                        window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
                      }}
                      className={`p-2 rounded-lg transition-all ${
                        theme === option.id 
                          ? 'bg-primary text-white shadow-lg' 
                          : 'text-textSecondary hover:text-textPrimary hover:bg-white/5'
                      }`}
                      title={option.label}
                    >
                      <option.icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
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
        <CropModal 
          image={rawImage} 
          onClose={() => setRawImage(null)} 
          onSave={handleSaveCrop} 
        />
      )}
    </div>
  );
}
