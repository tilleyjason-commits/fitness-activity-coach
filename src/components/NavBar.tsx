import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  Dumbbell,
  Home,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '~/components/Logo';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
}

/** Approved IA: Home / Workout / Log / Progress / More */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, isActive: (p) => p === '/' },
  {
    to: '/training',
    label: 'Workout',
    icon: Dumbbell,
    isActive: (p) => p === '/training' || p === '/routines',
  },
  {
    to: '/log',
    label: 'Log',
    icon: ClipboardList,
    // The meal tracker is the Log tab's flagship surface, not a More tool.
    isActive: (p) => p === '/log' || p.startsWith('/log/') || p === '/macros',
  },
  { to: '/weekly', label: 'Progress', icon: BarChart3, isActive: (p) => p === '/weekly' },
  {
    to: '/settings',
    label: 'More',
    icon: MoreHorizontal,
    isActive: (p) => p === '/settings' || p.startsWith('/settings/'),
  },
];

/**
 * One nav, two shapes: a fixed bottom tab bar sized for one-thumb use on a
 * 390px phone, and a sticky left rail from `md` up so a desktop window stops
 * showing phone chrome pinned to the bottom of a 1440px screen.
 */
export function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95 md:sticky md:inset-auto md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-t-0 md:bg-transparent md:backdrop-blur-none md:dark:bg-transparent"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto hidden md:flex md:items-center md:gap-2.5 md:px-3 md:pb-6 md:pt-7">
        <Logo size={28} withWordmark />
      </div>
      <div className="mx-auto grid w-full max-w-md grid-cols-5 md:flex md:max-w-none md:flex-col md:gap-1 md:px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors md:min-h-11 md:flex-row md:gap-3 md:rounded-xl md:px-3 md:text-sm ${
                active
                  ? 'text-emerald-600 dark:text-emerald-400 md:bg-emerald-500/10'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 md:hover:bg-slate-200/60 md:dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
