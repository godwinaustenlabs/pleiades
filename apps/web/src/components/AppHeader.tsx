import type { LucideIcon } from 'lucide-react';
import { Home, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCurrentUser } from '../lib/useCurrentUser';
import UserAvatar from './UserAvatar';

interface AppHeaderProps {
  icon: LucideIcon;
  /** The module's own name, e.g. "FINANCE". */
  title: string;
  /** The line under it, e.g. "Global Controllership". */
  subtitle: string;
  onProfile: () => void;
  onLogout: () => void;
  /** Shown under the name when the account has no job title. */
  roleFallback?: string;
  /** Anything module-specific that belongs between the avatar and the door. */
  children?: ReactNode;
}

/**
 * The bar across the top of every module page.
 *
 * Six pages carried a byte-for-byte copy of this markup, each with its accent
 * colour spelled out as a different literal (`success` in Finance, `primary` in
 * HR, `module` in Ops) even though every page is already wrapped in
 * `ModuleTheme`. They all read `--module` now, so a module's header and its tile
 * on the home screen cannot disagree.
 *
 * What changed for phones: the header no longer assumes it has room for
 * everything. The subtitle and the person's name are the two things that
 * overflowed a 390px screen, so the brand block truncates rather than pushing
 * the sign-out button off the edge, and the name column appears only once there
 * is space for it.
 */
export default function AppHeader({
  icon: Icon,
  title,
  subtitle,
  onProfile,
  onLogout,
  roleFallback = 'Employee',
  children,
}: AppHeaderProps) {
  // Read here rather than taken as a prop: six pages each parsed `ga_user`
  // their own way, and a photo uploaded from the profile dialog reached none of
  // them until a reload.
  const user = useCurrentUser();

  return (
    <header className="glass-panel sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 md:px-8 md:py-4">
      {/* min-w-0 is load-bearing: without it this flex child refuses to shrink
          below its content width and the whole header scrolls sideways. */}
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <div className="shrink-0 rounded-xl border border-module/20 bg-module/15 p-2 shadow-lg shadow-module/5">
          <Icon className="h-5 w-5 text-module md:h-6 md:w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-black leading-none tracking-tighter md:text-xl">
            <span className="text-module">{title}</span>
          </h1>
          <span className="block truncate text-[8px] font-black uppercase leading-tight tracking-[0.2em] text-textSecondary md:text-[10px]">
            {subtitle}
          </span>
        </div>
        <button
          onClick={() => {
            window.location.href = '/';
          }}
          aria-label="Home"
          className="ml-auto shrink-0 rounded-xl p-2 text-textSecondary transition-all hover:bg-module/10 hover:text-module md:ml-2"
        >
          <Home className="h-4 w-4 md:h-5 md:w-5" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1 md:gap-3">
        {children}
        <button
          onClick={onProfile}
          aria-label="Profile settings"
          className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-1 transition-all hover:bg-white/10 md:gap-3 md:pl-2 md:pr-4"
        >
          <UserAvatar
            name={user.name || user.username}
            email={user.email}
            photo={user.profilePhoto}
            size={30}
            className="shadow-lg shadow-module/20"
          />
          <div className="hidden text-left lg:block">
            <div className="mb-0.5 max-w-[10rem] truncate text-xs font-black leading-none">
              {user.name || user.username || 'User'}
            </div>
            <div className="max-w-[10rem] truncate text-[10px] font-black uppercase leading-none tracking-widest text-textSecondary">
              {user.title || roleFallback}
            </div>
          </div>
        </button>
        <div className="mx-0.5 hidden h-8 w-px bg-white/10 sm:block" />
        <button
          onClick={onLogout}
          aria-label="Sign out"
          className="rounded-xl p-2 text-textSecondary transition-all hover:bg-danger/10 hover:text-danger md:p-2.5"
        >
          <LogOut className="h-4 w-4 md:h-5 md:w-5" />
        </button>
      </div>
    </header>
  );
}
