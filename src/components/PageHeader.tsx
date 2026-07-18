import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Back-link target; omit to hide the back arrow. */
  backTo?: string;
}

/** Shared page header for log/detail screens. */
export function PageHeader({ title, subtitle, backTo }: PageHeaderProps) {
  return (
    <header className="mb-5 flex items-center gap-3">
      {backTo && (
        <Link
          to={backTo}
          aria-label="Back"
          className="-ml-1 rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      )}
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
    </header>
  );
}
