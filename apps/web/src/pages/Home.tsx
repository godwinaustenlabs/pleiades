import { useState, useEffect, useMemo, useCallback } from 'react';
import type React from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Shield, Users, Briefcase, Activity, Code, Target, Settings, LogOut, LayoutDashboard, Lock, Loader2, UserCog, ArrowUpRight, Sparkles } from 'lucide-react';
import Logo from '../components/Logo';
import { Link } from 'react-router-dom';
import ProfileModal from '../components/ProfileModal';
import { usePermissions } from '../lib/usePermissions';

/* Each app carries its own hue (see --app-* in index.css) and a short label
   that says what the module is for, rather than repeating its own name. The
   `hue` is a custom-property reference, not a literal: Tailwind cannot emit a
   class per colour at build time, so the tile reads it through `--tile`. */
const ALL_APPS = [
  {
    id: 'dashboard',
    name: 'Your Workspace',
    description: 'Tasks assigned to you, the notes you keep, and the numbers you are measured on — all in one place.',
    kicker: 'Start here',
    icon: LayoutDashboard,
    hue: 'var(--app-dashboard)',
    url: '/dashboard',
    alwaysVisible: true,
    featured: true,
  },
  {
    id: 'hr',
    name: 'Human Resources',
    description: 'Employees, payroll, and appointments.',
    kicker: 'People',
    icon: Users,
    hue: 'var(--app-hr)',
    url: '/hr',
  },
  {
    id: 'finance',
    name: 'Finance & Accounts',
    description: 'Transactions, invoices, ledgers, and budgets.',
    kicker: 'Money',
    icon: Briefcase,
    hue: 'var(--app-finance)',
    url: '/finance',
  },
  {
    id: 'legal',
    name: 'Legal & Compliance',
    description: 'Contracts, intellectual property, and statutory obligations.',
    kicker: 'Obligations',
    icon: Shield,
    hue: 'var(--app-legal)',
    url: '/legal',
  },
  {
    id: 'ops',
    name: 'Operations',
    description: 'Labs, committees, and the monthly reporting cycle.',
    kicker: 'Running the place',
    icon: Activity,
    hue: 'var(--app-ops)',
    url: '/ops',
  },
  {
    id: 'tech',
    name: 'Technology',
    description: 'Projects, environments, releases, and deployments.',
    kicker: 'Engineering',
    icon: Code,
    hue: 'var(--app-tech)',
    url: '/tech',
  },
  {
    id: 'acquisition',
    name: 'Acquisition',
    description: 'Campaigns, leads, and marketing funnels.',
    kicker: 'Growth',
    icon: Target,
    hue: 'var(--app-acquisition)',
    url: '/acquisition',
  },
  {
    id: 'crm',
    name: 'Committee CRM',
    description: 'Committee workflows and client support.',
    kicker: 'Clients',
    icon: Shield,
    hue: 'var(--app-crm)',
    url: '/crm',
  },
  {
    id: 'admin',
    name: 'Access',
    description: 'Grant each person the features they need, one by one.',
    kicker: 'Administration',
    icon: UserCog,
    hue: 'var(--app-admin)',
    url: '/admin',
  },
];

type App = (typeof ALL_APPS)[number];

/* Column spans for the bento grid, over six columns.

   The featured tile is four columns wide and two rows tall, which leaves a
   two-by-two hole beside it — so the first two tiles after it must be exactly
   two columns wide or auto-placement pushes them onto a new row and the hole
   stays open. Everything after that fills whole six-column rows on a repeating
   3-3 / 2-2-2 rhythm, which is what stops the grid reading as a wall of
   identical blocks. The visible app list depends on the caller's grants, so the
   trailing tile is widened to close whatever gap the last partial row leaves. */
const SPAN_CYCLE = [3, 3, 2, 2, 2];
const SIDE_SLOTS = 2;
const SPAN_CLASS: Record<number, string> = {
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  5: 'lg:col-span-5',
  6: 'lg:col-span-6',
};

/* The featured tile only earns its second row when there are two tiles to sit
   beside it; with one it would strand an empty cell, and with none it should
   simply take the full width. */
function featuredClass(restCount: number): string {
  if (restCount === 0) return 'sm:col-span-2 lg:col-span-6';
  if (restCount === 1) return 'sm:col-span-2 lg:col-span-4';
  return 'sm:col-span-2 lg:col-span-4 lg:row-span-2';
}

function layoutSpans(count: number, hasFeatured: boolean): number[] {
  const spans: number[] = [];
  let i = 0;

  if (hasFeatured) {
    for (; i < Math.min(SIDE_SLOTS, count); i++) spans.push(2);
  }
  for (let c = 0; i < count; i++, c++) spans.push(SPAN_CYCLE[c % SPAN_CYCLE.length]);

  // Rows beside the featured tile are already flush, so tail-fill accounting
  // starts at the first tile that begins a row of its own.
  const from = hasFeatured ? Math.min(SIDE_SLOTS, count) : 0;
  let lastInRow = -1;
  let used = 0;
  for (let k = from; k < spans.length; k++) {
    if (used + spans[k] > 6) used = 0;
    used += spans[k];
    lastInRow = k;
  }
  if (used > 0 && used < 6 && lastInRow >= 0) spans[lastInRow] += 6 - used;

  return spans;
}

/* Feeds the cursor position to the tile's radial-gradient spotlight. Writing
   the custom property directly keeps this off React's render path — a state
   update per pointermove would re-render the whole grid. */
function trackSpotlight(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  el.style.setProperty('--my', `${e.clientY - rect.top}px`);
}

function Home() {
  const [showProfile, setShowProfile] = useState(false);
  // Grants come from the shared hook, which resolves them per user.
  const { grants: userPermissions, loaded } = usePermissions();
  const loading = !loaded;

  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('ga_user') || '{}'));

  useEffect(() => {
    const handleUpdate = () => {
      setUser(JSON.parse(localStorage.getItem('ga_user') || '{}'));
    };
    window.addEventListener('ga_user_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('ga_user_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const getProfileUrl = useCallback((url: string) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('/api')) return url;
    return `/api/assets/download/${url.startsWith('/') ? url.slice(1) : url}`;
  }, []);

  const visibleApps = useMemo(() => {
    if (user.isSuperadmin) return ALL_APPS;

    return ALL_APPS.filter(app => {
      if (app.alwaysVisible) return true;
      // Visible when the user holds canView on any feature of the app.
      return userPermissions.some(p => p.appName === app.id && p.canView);
    });
  }, [userPermissions, user.isSuperadmin]);

  const { featured, rest, spans } = useMemo(() => {
    const f = visibleApps.find(a => a.featured) ?? null;
    const r = visibleApps.filter(a => a !== f);
    return { featured: f, rest: r, spans: layoutSpans(r.length, f !== null) };
  }, [visibleApps]);

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
          <Loader2 className="relative w-9 h-9 text-primary animate-spin" />
        </div>
        <p className="eyebrow">Initializing platform</p>
      </div>
    );
  }

  const firstName = (user.name || user.username || '').split(' ')[0];

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6 md:p-10 font-sans relative text-textPrimary">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="z-10 w-full max-w-7xl flex justify-between items-center gap-4 mb-14 md:mb-20 animate-rise">
        <Link to="/" className="flex items-center gap-2.5 md:gap-3 group">
          <Logo className="w-8 h-8 md:w-9 md:h-9 transition-transform duration-500 group-hover:rotate-[-8deg]" />
          <span className="font-display text-lg md:text-xl font-extrabold tracking-tight">
            Pleiades
          </span>
          <span className="hidden sm:inline-block h-4 w-px bg-border" />
          <span className="hidden sm:inline eyebrow">Godwin Austen Labs</span>
        </Link>

        {user.id ? (
          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-2.5 pl-1.5 pr-2.5 md:pr-3.5 py-1.5 rounded-full solid-panel hover:border-borderStrong transition-all duration-300 group"
            >
              <span className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center font-bold text-[11px] text-surface overflow-hidden shrink-0">
                {user.profilePhoto ? (
                  <img src={getProfileUrl(user.profilePhoto)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?'
                )}
              </span>
              <span className="text-left hidden sm:block leading-tight">
                <span className="block text-xs font-semibold">{user.name || user.username || 'Member'}</span>
                <span className="block text-[10px] text-textTertiary font-medium">{user.title || 'Staff'}</span>
              </span>
              <Settings className="w-3.5 h-3.5 text-textTertiary group-hover:text-primary group-hover:rotate-90 transition-all duration-500" />
            </button>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              className="p-2.5 text-textTertiary hover:text-danger hover:bg-danger/10 rounded-full transition-all duration-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link to="/login" className="btn-primary text-xs px-5 py-2">Sign in</Link>
        )}
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="z-10 w-full max-w-7xl mb-10 md:mb-14 animate-rise" style={{ animationDelay: '60ms' }}>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-[0.18em] mb-6">
          <Sparkles className="w-3 h-3" />
          {user.id ? `${greeting}${firstName ? `, ${firstName}` : ''}` : 'Secure gateway'}
        </div>
        <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] max-w-4xl mb-5">
          <span className="text-gradient">Everything the lab runs on,</span>
          <br />
          <span className="text-textSecondary">in one place.</span>
        </h1>
        <p className="text-base md:text-lg text-textSecondary max-w-2xl leading-relaxed">
          {user.id
            ? 'The modules below are the ones your access covers. Pick one to get to work.'
            : 'A granular, audited operating system for the people and agents that keep Godwin Austen Labs running.'}
        </p>
      </section>

      {/* ── Bento grid ───────────────────────────────────────────────────── */}
      <main className="z-10 w-full max-w-7xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4 auto-rows-[minmax(170px,auto)]">
        {featured && (
          <BentoTile
            app={featured}
            className={featuredClass(rest.length)}
            variant="featured"
            index={0}
          />
        )}

        {rest.map((app, i) => (
          <BentoTile
            key={app.id}
            app={app}
            className={SPAN_CLASS[spans[i]] ?? 'lg:col-span-2'}
            variant="standard"
            index={i + 1}
          />
        ))}

        {!user.id ? (
          <EmptyState
            icon={Shield}
            title="Sign in to continue"
            body="Departmental portals and operational tools require an authenticated session."
            action={<Link to="/login" className="btn-primary mt-5 text-xs">Sign in</Link>}
          />
        ) : rest.length === 0 && (
          <EmptyState
            icon={Lock}
            title="No modules provisioned yet"
            body="You have your personal workspace. Departmental access is granted per feature by an administrator."
          />
        )}
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="z-10 mt-20 md:mt-28 pt-8 border-t border-border w-full max-w-7xl flex flex-col sm:flex-row justify-between items-center gap-3">
        <span className="eyebrow">&copy; {new Date().getFullYear()} Godwin Austen Labs</span>
        <span className="eyebrow">Operational infrastructure</span>
      </footer>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}

/* One tile, two weights. The featured variant gets room to breathe and a
   larger watermark; the standard variant is compact enough to sit three to a
   row. Both share the hover behaviour defined on `.bento-tile`. */
function BentoTile({
  app,
  className,
  variant,
  index,
}: {
  app: App;
  className: string;
  variant: 'featured' | 'standard';
  index: number;
}) {
  const Icon = app.icon;
  const isFeatured = variant === 'featured';

  return (
    <Link
      to={app.url}
      onPointerMove={trackSpotlight}
      style={{ '--tile': app.hue, animationDelay: `${100 + index * 45}ms` } as React.CSSProperties}
      className={`bento-tile animate-rise group flex flex-col ${isFeatured ? 'p-7 md:p-9' : 'p-5 md:p-6'} ${className}`}
    >
      <Icon
        className={`tile-ghost ${isFeatured ? 'w-56 h-56 md:w-72 md:h-72' : 'w-28 h-28 md:w-36 md:h-36'}`}
        strokeWidth={1}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-xl flex items-center justify-center tile-badge transition-transform duration-500 group-hover:scale-105 ${
 isFeatured ? 'w-12 h-12 md:w-14 md:h-14' : 'w-10 h-10'
 }`}
        >
          <Icon className={isFeatured ? 'w-6 h-6 md:w-7 md:h-7' : 'w-5 h-5'} />
        </span>
        <span className="eyebrow tile-accent-text opacity-70">{app.kicker}</span>
      </div>

      <h2
        className={`font-display font-bold tracking-tight ${
 isFeatured ? 'text-2xl md:text-4xl pt-8' : 'text-lg md:text-xl mt-auto pt-6'
 }`}
      >
        {app.name}
      </h2>
      <p
        className={`text-textSecondary leading-relaxed mt-2 ${
 isFeatured ? 'text-sm md:text-base max-w-md' : 'text-xs md:text-[13px]'
 }`}
      >
        {app.description}
      </p>

      <div className={`flex items-center gap-2 ${isFeatured ? 'mt-auto pt-8' : 'mt-5'}`}>
        <span className="tile-cta w-9 h-9 rounded-full flex items-center justify-center shrink-0">
          <ArrowUpRight className="w-4 h-4 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
        <span className="text-[11px] font-semibold text-textTertiary group-hover:text-textSecondary transition-colors">
          Open
        </span>
      </div>
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="sm:col-span-2 lg:col-span-6 solid-panel rounded-bento border-dashed p-10 md:p-14 flex flex-col items-center justify-center text-center animate-rise">
      <span className="w-14 h-14 rounded-2xl bg-surfaceAlt border border-border flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-textTertiary" />
      </span>
      <h3 className="font-display text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-textSecondary max-w-sm leading-relaxed">{body}</p>
      {action}
    </div>
  );
}

export default Home;
