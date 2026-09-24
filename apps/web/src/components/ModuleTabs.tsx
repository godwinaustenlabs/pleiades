import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ModuleTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A count to show on the tab, e.g. pending resets. Zero renders nothing. */
  badge?: number;
}

interface ModuleTabsProps {
  tabs: readonly ModuleTab[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * A module's tab bar, in the two shapes it needs.
 *
 * Desktop keeps the underlined strip. Phones get a scrolling row of pills
 * instead of what was there before — a dropdown (`MobileTabMenu`) that hid the
 * whole navigation behind a tap and, because it built its classes by
 * interpolation (`text-${accentColor}`), rendered with no accent at all: those
 * class names never exist at build time, so Tailwind never emitted them.
 *
 * Scrolling pills mean one tap per tab instead of two, and they show where you
 * are in the set. The active pill is scrolled into view whenever it changes, so
 * arriving on Finance's twelfth tab does not leave the strip parked at the
 * first.
 */
export default function ModuleTabs({ tabs, active, onChange }: ModuleTabsProps) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);

  if (tabs.length === 0) return null;

  return (
    <>
      {/* Desktop: underlined strip */}
      <div className="hidden border-b border-white/5 bg-surface/30 px-4 backdrop-blur-md md:block md:px-8 table-scroll no-scrollbar">
        <div className="mx-auto flex max-w-7xl gap-1 md:gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-4 text-[9px] font-black uppercase tracking-widest transition-all md:px-6 md:py-5 md:text-[11px] ${
                active === t.id
                  ? 'border-module bg-module/5 text-module'
                  : 'border-transparent text-textSecondary hover:bg-white/5 hover:text-textPrimary'
              }`}
            >
              <t.icon className={`h-3 w-3 md:h-3.5 md:w-3.5 ${active === t.id ? 'text-module' : 'text-textSecondary'}`} />
              {t.label}
              {!!t.badge && (
                <span className="rounded-full bg-danger px-1.5 py-0.5 text-[9px] leading-none text-onScrim">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Phone: scrolling pills, full-bleed under the header so the strip runs
          edge to edge while its contents keep the page's gutter. */}
      <div
        ref={strip}
        className="scroll-x no-scrollbar border-b border-white/5 bg-surface/30 px-4 py-2.5 backdrop-blur-md md:hidden"
      >
        <div className="flex w-max gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-active={active === t.id}
              onClick={() => onChange(t.id)}
              className={`flex shrink-0 snap-center items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-[11px] font-bold transition-all active:scale-[0.97] ${
                active === t.id
                  ? 'border-module/40 bg-module/15 text-module'
                  : 'border-border bg-surfaceAlt text-textSecondary'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {!!t.badge && (
                <span className="rounded-full bg-danger px-1.5 py-0.5 text-[9px] leading-none text-onScrim">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
