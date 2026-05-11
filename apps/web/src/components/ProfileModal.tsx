import React, { useState, useEffect } from 'react';
import { User, Key, Save, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';

interface ProfileModalProps {
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ProfileModal({ onClose, onUpdate }: ProfileModalProps) {
  const [form, setForm] = useState({ name: '', username: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch(`${API}/auth/profile`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setForm(f => ({ ...f, name: data.data.name || '', username: data.data.username || '' }));
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
          ...(form.password ? { password: form.password } : {})
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update profile');
      } else {
        // Sync local storage
        const localUser = JSON.parse(localStorage.getItem('ganova_user') || '{}');
        localStorage.setItem('ganova_user', JSON.stringify({
          ...localUser,
          name: form.name,
          username: form.username
        }));
        
        setSuccess('Profile updated successfully');
        if (onUpdate) onUpdate();
        // Clear password fields
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
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-start gap-3 text-sm text-green-400">
                  <CheckCircle className="w-4 h-4 mt-0.5" />
                  {success}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-1.5 ml-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Your Name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-1.5 ml-1">Username</label>
                <input
                  type="text"
                  placeholder="username"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              <div className="pt-2 border-t border-white/5 mt-4">
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-3 ml-1 flex items-center gap-2">
                  <Key className="w-3 h-3" /> Change Password
                </label>
                <div className="space-y-3">
                  <input
                    type="password"
                    placeholder="New Password (min 8 chars)"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    value={form.confirmPassword}
                    onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
