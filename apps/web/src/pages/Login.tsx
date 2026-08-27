import React, { useState } from 'react';
import { Key, AlertCircle, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { API } from '../lib/auth';


export default function Login({ onLogin }: { onLogin: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('ga_token', data.data.token);
      localStorage.setItem('ga_user', JSON.stringify(data.data.user));
      onLogin();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 font-sans relative overflow-hidden text-textPrimary">
      {/* Background Orbs */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="z-10 w-full max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 mb-6">
            <Logo className="w-full h-full" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Secure Login</h1>
          <p className="text-sm text-textSecondary text-center">
            Authenticate to access your department portal.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-textSecondary mb-1.5 uppercase tracking-wider">
              Username or Email
            </label>
            <input
              type="text"
              required
              placeholder="user@godwinausten.org"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 focus:bg-surface transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-textSecondary mb-1.5 uppercase tracking-wider flex justify-between">
              <span>Password</span>
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 focus:bg-surface transition-colors"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Key className="w-4 h-4" /> Sign In</>}
          </button>
        </form>
      </div>
      
      {/* Footer */}
      <div className="z-10 mt-12 text-xs text-textSecondary text-center max-w-sm">
        By logging in, you agree to the Godwin Austen Labs organizational data policy and terms of use.
      </div>
    </div>
  );
}
