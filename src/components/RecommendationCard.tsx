import { AlertCircle, AlertTriangle, Info, X, type LucideIcon } from 'lucide-react';
import type { Severity } from '~/lib/types';

interface SeverityStyle {
  border: string;
  iconColor: string;
  badge: string;
  icon: LucideIcon;
  label: string;
}

const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  critical: {
    border: 'border-l-red-500',
    iconColor: 'text-red-500',
    badge: 'bg-red-500/15 text-red-600 dark:text-red-400',
    icon: AlertTriangle,
    label: 'Critical',
  },
  high: {
    border: 'border-l-orange-500',
    iconColor: 'text-orange-500',
    badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    icon: AlertTriangle,
    label: 'High',
  },
  medium: {
    border: 'border-l-amber-500',
    iconColor: 'text-amber-500',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    icon: AlertCircle,
    label: 'Medium',
  },
  low: {
    border: 'border-l-blue-400',
    iconColor: 'text-blue-400',
    badge: 'bg-blue-400/15 text-blue-600 dark:text-blue-300',
    icon: Info,
    label: 'Low',
  },
  info: {
    border: 'border-l-slate-400',
    iconColor: 'text-slate-400',
    badge: 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
    icon: Info,
    label: 'Info',
  },
};

interface RecommendationCardProps {
  severity: Severity;
  message: string;
  /** Rule domain shown as a small caption ("nutrition", "sleep", ...). */
  domain?: string;
  onDismiss?: () => void;
}

/** One coaching recommendation, color-coded by severity. */
export function RecommendationCard({ severity, message, domain, onDismiss }: RecommendationCardProps) {
  const style = SEVERITY_STYLES[severity];
  const Icon = style.icon;

  return (
    <div className={`card flex items-start gap-3 border-l-4 ${style.border}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}>
            {style.label}
          </span>
          {domain && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {domain}
            </span>
          )}
        </div>
        <p className="text-sm leading-snug text-slate-700 dark:text-slate-200">{message}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss recommendation"
          className="-m-1 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
