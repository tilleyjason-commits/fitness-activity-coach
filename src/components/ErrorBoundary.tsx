import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called before re-rendering children on "Try again" (lets the host clear bad state). */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Root error boundary: a render crash shows an accessible recovery UI instead
 * of a blank page. Logging is limited to the error message/stack and component
 * stack — never auth tokens, environment values, or user-entered content.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error.message, error.stack ?? '', info.componentStack ?? '');
  }

  handleRetry = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error === null) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" aria-hidden />
          <h1 className="mb-1 text-lg font-bold">Something went wrong</h1>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            The app hit an unexpected error. Your saved data is safe — try again, or reload the
            page if the problem persists.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              Reload the app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
