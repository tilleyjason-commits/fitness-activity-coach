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

const LINKS: LogLink[] = [
  {
    to: '/training',
    label: 'Workout tracker',
    description: 'Live session logging (canonical)',
    icon: Dumbbell,
  },
  {
    to: '/log/training',
    label: 'Training backfill',
    description: 'Mark a past session complete',
    icon: Dumbbell,
  },
  {
    to: '/macros',
    label: 'Meals & macros',
    description: 'AI or manual meal entry',
    icon: UtensilsCrossed,
  },
  {
    to: '/log/nutrition',
    label: 'Nutrition summary',
    description: 'Daily totals and timing flags',
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
  {
    to: '/log/weight',
    label: 'Weight & waist',
    description: 'Weekly check-in',
    icon: Scale,
  },
];

/** Hub for all logging entry points (approved bottom-nav “Log” destination). */
export default function LogHub() {
  return (
    <div>
      <PageHeader title="Log" subtitle="Capture today’s training, food, and recovery" />
      <ul className="space-y-2">
        {LINKS.map(({ to, label, description, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="card flex w-full items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
