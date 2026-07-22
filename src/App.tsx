import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { NavBar } from '~/components/NavBar';
import { getProfile } from '~/lib/db';
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

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" aria-label="Loading" />
    </div>
  );
}

/** Redirects unauthenticated visitors to /login; redirects new users to /setup. */
function AuthGuard() {
  const { user, loading } = useAuth();
  const [profileState, setProfileState] = useState<{
    userId: string;
    ready: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user || loading) return;
    let active = true;
    setProfileState(null);
    getProfile(user.id)
      .then((p) => {
        if (!active) return;
        // Profile exists if any meaningful field was ever set (age/height from wizard,
        // or weight/bodyfat from old Settings page). If all null, it's a brand-new user
        // who needs the setup wizard.
        const hasData = p !== null && (
          p.age !== null || p.height_cm !== null ||
          p.weight_lb !== null || p.bodyfat_pct !== null
        );
        setProfileState({ userId: user.id, ready: hasData });
      })
      .catch(() => {
        if (active) setProfileState({ userId: user.id, ready: true });
      }); // fail open — a network error should not trap an existing user
    return () => {
      active = false;
    };
  }, [user, loading]);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // Do not redirect to setup until this specific user's profile lookup settles.
  // The old boolean initialized false and redirected every existing user to
  // /setup before the async lookup could complete.
  if (profileState === null || profileState.userId !== user.id) return <LoadingScreen />;
  if (!profileState.ready) return <Navigate to="/setup" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-28 pt-6">
      <Outlet />
      <NavBar />
    </div>
  );
}

/** HashRouter keeps client-side routes compatible with static GitHub Pages hosting. */
export default function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
