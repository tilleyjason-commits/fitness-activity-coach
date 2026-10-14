import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { NavBar } from '~/components/NavBar';
import { ReminderScheduler } from '~/components/ReminderScheduler';
import { getProfile } from '~/lib/db';
import { resolveProfileGate, type ProfileGateOutcome } from '~/lib/profile-gate';
import { lazy, Suspense, useEffect, useState } from 'react';

const Login = lazy(() => import('~/pages/Login'));
const Dashboard = lazy(() => import('~/pages/Dashboard'));
const TrainingPage = lazy(() => import('~/pages/TrainingPage'));
const RoutinesPage = lazy(() => import('~/pages/RoutinesPage'));
const LogHub = lazy(() => import('~/pages/LogHub'));
const LogTraining = lazy(() => import('~/pages/LogTraining'));
const LogNutrition = lazy(() => import('~/pages/LogNutrition'));
const LogSupplements = lazy(() => import('~/pages/LogSupplements'));
const LogSleep = lazy(() => import('~/pages/LogSleep'));
const LogSubjective = lazy(() => import('~/pages/LogSubjective'));
const LogWeight = lazy(() => import('~/pages/LogWeight'));
const MacroTrackerPage = lazy(() => import('~/pages/MacroTrackerPage'));
const WeeklySummary = lazy(() => import('~/pages/WeeklySummary'));
const Settings = lazy(() => import('~/pages/Settings'));
const ManageSupplements = lazy(() => import('~/pages/ManageSupplements'));
const SetupWizard = lazy(() => import('~/pages/SetupWizard'));

function LoadingScreen({ stalled = false }: { stalled?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" aria-label="Loading" />
      {stalled && (
        <div role="status" className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Still connecting. Your session is not lost.
          </p>
          <div className="flex justify-center gap-3">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
            <a href="#/login" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">
              Sign in again
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p role="alert" className="text-sm text-slate-700 dark:text-slate-200">
        We could not load your profile. Check your connection and try again.
      </p>
      <button type="button" className="btn-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** Redirects unauthenticated visitors to /login; redirects new users to /setup. */
function AuthGuard() {
  const { user, loading, stalled } = useAuth();
  const [profileState, setProfileState] = useState<{
    userId: string;
    outcome: ProfileGateOutcome;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user || loading) return;
    let active = true;
    // Same-user token refresh must not blank the tree. Clearing profileState
    // here unmounts TrainingPage and drops unsaved sets.
    setProfileState((prev) => (prev?.userId === user.id ? prev : null));
    getProfile(user.id)
      .then((p) => {
        if (!active) return;
        setProfileState({
          userId: user.id,
          outcome: resolveProfileGate(user.id, { ok: true, profile: p }),
        });
      })
      .catch(() => {
        // A user who is known to have finished setup keeps working offline;
        // anyone else sees a retry screen (never the app, never skipped onboarding).
        if (active) {
          setProfileState({
            userId: user.id,
            outcome: resolveProfileGate(user.id, { ok: false }),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [user, loading, attempt]);

  if (loading) return <LoadingScreen stalled={stalled} />;
  if (!user) return <Navigate to="/login" replace />;
  // Do not redirect to setup until this specific user's profile lookup settles.
  // The old boolean initialized false and redirected every existing user to
  // /setup before the async lookup could complete.
  if (profileState === null || profileState.userId !== user.id) return <LoadingScreen />;
  if (profileState.outcome === 'error') {
    return (
      <ProfileLoadError
        onRetry={() => {
          setProfileState(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (profileState.outcome === 'needs-setup') return <Navigate to="/setup" replace />;

  // Phone: single column with the tab bar fixed to the bottom. Desktop (md+):
  // the same column, centred beside a sticky nav rail.
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl">
      <ReminderScheduler />
      <NavBar />
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-6 md:pb-10 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
}

/** HashRouter keeps client-side routes compatible with static GitHub Pages hosting. */
export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Outside the AuthGuard so no NavBar renders; SetupWizard checks auth itself. */}
          <Route path="/setup" element={<SetupWizard />} />
          <Route element={<AuthGuard />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/routines" element={<RoutinesPage />} />
            <Route path="/log" element={<LogHub />} />
            <Route path="/log/training" element={<LogTraining />} />
            <Route path="/log/nutrition" element={<LogNutrition />} />
            <Route path="/log/supplements" element={<LogSupplements />} />
            <Route path="/log/sleep" element={<LogSleep />} />
            <Route path="/log/subjective" element={<LogSubjective />} />
            <Route path="/log/weight" element={<LogWeight />} />
            <Route path="/macros" element={<MacroTrackerPage />} />
            <Route path="/weekly" element={<WeeklySummary />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/supplements" element={<ManageSupplements />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
