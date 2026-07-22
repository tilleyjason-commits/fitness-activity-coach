import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  Dumbbell,
  Home,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

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
    isActive: (p) => p === '/log' || p.startsWith('/log/'),
  },
  { to: '/weekly', label: 'Progress', icon: BarChart3, isActive: (p) => p === '/weekly' },
  {
    to: '/settings',
    label: 'More',
    icon: MoreHorizontal,
    isActive: (p) => p === '/settings' || p.startsWith('/settings/') || p === '/macros',
  },
];

/** Fixed bottom navigation, sized for one-thumb use on a 390px phone. */
export function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid w-full max-w-md grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
