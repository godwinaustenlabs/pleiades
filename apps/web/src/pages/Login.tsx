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
    <div className="min-h-screen flex items-stretch font-sans text-textPrimary">
      {/* Brand panel. Hidden below lg so the form owns the whole viewport on a
          phone rather than being pushed under a decorative header. */}
      <aside className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative overflow-hidden flex-col justify-between p-14 bg-surfaceAlt border-r border-border">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 70% 60% at 15% 10%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%),' +
              'radial-gradient(ellipse 60% 50% at 90% 95%, color-mix(in oklab, var(--accent) 15%, transparent), transparent 55%)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <Logo className="w-9 h-9" />
          <span className="font-display text-xl font-extrabold tracking-tight">Pleiades</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl xl:text-5xl font-extrabold leading-[1.1] mb-5">
            <span className="text-gradient">The operating system</span>
            <br />
            <span className="text-textSecondary">for Godwin Austen Labs.</span>
          </h2>
          <p className="text-sm text-textSecondary leading-relaxed">
            Human resources, finance, legal, operations, engineering and acquisition — one
            audited surface, with access granted a feature at a time.
          </p>
        </div>

        <p className="relative eyebrow">&copy; {new Date().getFullYear()} Godwin Austen Labs</p>
      </aside>

      {/* Form panel */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-rise">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <Logo className="w-9 h-9" />
            <span className="font-display text-xl font-extrabold tracking-tight">Pleiades</span>
          </div>

          <h1 className="font-display text-3xl font-extrabold tracking-tight mb-2">Sign in</h1>
          <p className="text-sm text-textSecondary mb-8">
            Use your Godwin Austen Labs credentials.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/25 flex items-start gap-3"
            >
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="identifier" className="block text-xs font-semibold text-textSecondary mb-2">
                Username or email
              </label>
              <input
                id="identifier"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="user@godwinausten.org"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="field"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-textSecondary mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 mt-2">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" /> Sign in
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-xs text-textTertiary leading-relaxed">
            By signing in you agree to the Godwin Austen Labs organizational data policy and
            terms of use.
          </p>
        </div>
      </main>
    </div>
  );
}
