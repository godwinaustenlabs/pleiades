import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { API } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import Logo from '../components/Logo';

/**
 * Where the emailed reset link lands.
 *
 * This route did not exist, which made the whole flow a dead end: the approval mail
 * carried `/reset?token=…`, the SPA had no match for it, and the person who had just
 * been sent a link got a blank page. The API halves were both already there.
 *
 * Deliberately says as little as possible about what the token is. An invalid one, an
 * expired one and one belonging to somebody else all produce the server's own message
 * and nothing inferred here — this page is reachable by anybody with a URL, so it must
 * not become a way to probe which tokens exist.
 */
export default function ResetPassword() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read from the query string once, then drop it from the address bar so the
    // token does not sit in history, or get carried into a Referer if this page
    // ever loads a third-party resource.
    const url = new URL(window.location.href);
    const t = url.searchParams.get('token') ?? '';
    setToken(t);
    if (t) {
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = token !== '' && password.length >= 8 && confirm === password && !saving;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/auth/complete-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'That did not work.');
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo className="h-9 w-9" />
          <h1 className="text-sm font-black uppercase tracking-widest text-textPrimary">
            {done ? 'Password changed' : 'Choose a new password'}
          </h1>
        </div>

        {done ? (
          <div className="rounded-xl border border-border bg-surface p-5 text-center">
            <Check className="mx-auto mb-3 h-8 w-8 text-success" />
            <p className="mb-5 text-xs leading-relaxed text-textSecondary">
              Your password has been changed and the link you used is now spent. Sign in with the
              new one.
            </p>
            <Link
              to="/login"
              className="inline-block rounded-lg bg-primary px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-onScrim"
            >
              Sign in
            </Link>
          </div>
        ) : !token ? (
          <div className="rounded-xl border border-border bg-surface p-5 text-center">
            <AlertCircle className="mx-auto mb-3 h-7 w-7 text-warning" />
            <p className="text-xs leading-relaxed text-textSecondary">
              This page needs the link from your email. Open the message and follow the link in it
              rather than typing this address by hand.
            </p>
            <Link to="/login" className="mt-4 inline-block text-[11px] font-bold text-primary">
              Back to sign in
            </Link>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">
                New password
              </span>
              <div className="flex items-center rounded-lg border border-border bg-surfaceAlt">
                <input
                  type={reveal ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-textPrimary outline-none"
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                  className="px-3 text-textSecondary"
                >
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {tooShort && <span className="mt-1 block text-[11px] text-warning">At least 8 characters.</span>}
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">
                Again
              </span>
              <input
                type={reveal ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-surfaceAlt px-3 py-2.5 text-textPrimary outline-none"
              />
              {mismatch && <span className="mt-1 block text-[11px] text-warning">These do not match.</span>}
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={!ready}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.99] disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Set password
            </button>

            <p className="text-center text-[10px] leading-relaxed text-textSecondary">
              The link expires an hour after it was approved and works once. Until you finish here,
              your current password still works.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
