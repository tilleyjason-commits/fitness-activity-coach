import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Dumbbell,
  Moon,
  Pill,
  Scale,
  Smile,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '~/components/PageHeader';

interface LogLink {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface LogGroup {
  title: string;
  links: LogLink[];
}

/** Grouped by job-to-be-done: daily logging, the weekly check-in, and repairs. */
const GROUPS: LogGroup[] = [
  {
    title: 'Today',
    links: [
      {
        to: '/macros',
        label: 'Log meal',
        description: 'Describe a meal — AI fills in the macros',
        icon: UtensilsCrossed,
      },
      {
        to: '/log/supplements',
        label: 'Supplements',
        description: 'Mark today’s doses',
        icon: Pill,
      },
      {
        to: '/log/sleep',
        label: 'Sleep',
        description: 'Bedtime, wake, caffeine',
        icon: Moon,
      },
      {
        to: '/log/subjective',
        label: 'How you feel',
        description: 'Energy, stress, hunger',
        icon: Smile,
      },
    ],
  },
  {
    title: 'Weekly check-in',
    links: [
      {
        to: '/log/weight',
        label: 'Weight & waist',
        description: 'Same scale, same time, once a week',
        icon: Scale,
      },
    ],
  },
  {
    title: 'Fix a past day',
    links: [
      {
        to: '/log/training',
        label: 'Training backfill',
        description: 'Mark a missed session complete',
        icon: Dumbbell,
      },
      {
        to: '/log/nutrition',
        label: 'Adjust daily totals',
        description: 'Correct calories, protein, and timing flags',
        icon: UtensilsCrossed,
      },
    ],
  },
];

/** Hub for all logging entry points (approved bottom-nav “Log” destination). */
export default function LogHub() {
  return (
    <div>
      <PageHeader title="Log" subtitle="Capture today’s training, food, and recovery" />
      {GROUPS.map(({ title, links }) => (
        <section key={title} className="mb-5" aria-label={title}>
          <h2 className="section-title">{title}</h2>
          <ul className="space-y-2">
            {links.map(({ to, label, description, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="card flex w-full items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {description}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
