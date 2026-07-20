import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '~/context/AuthContext';
import { NavBar } from '~/components/NavBar';
import { getProfile } from '~/lib/db';
import { useEffect, useState } from 'react';
import Login from '~/pages/Login';
import Dashboard from '~/pages/Dashboard';
import TrainingPage from '~/pages/TrainingPage';
import RoutinesPage from '~/pages/RoutinesPage';
import LogTraining from '~/pages/LogTraining';
import LogNutrition from '~/pages/LogNutrition';
import LogSupplements from '~/pages/LogSupplements';
import LogSleep from '~/pages/LogSleep';
import LogSubjective from '~/pages/LogSubjective';
import LogWeight from '~/pages/LogWeight';
import MacroTrackerPage from '~/pages/MacroTrackerPage';
import WeeklySummary from '~/pages/WeeklySummary';
import Settings from '~/pages/Settings';
import SetupWizard from '~/pages/SetupWizard';

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
  const [profileReady, setProfileReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user || loading) return;
    getProfile(user.id)
      .then((p) => setProfileReady(p?.age !== null && p?.height_cm !== null))
      .catch(() => setProfileReady(true)); // fail open
  }, [user, loading]);

  if (loading || profileReady === null) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profileReady) return <Navigate to="/setup" replace />;

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-28 pt-6">
      <Outlet />
      <NavBar />
    </div>
  );
}

/** HashRouter so the app works from GH Pages / file-relative deploys (vite base './'). */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Outside the AuthGuard so no NavBar renders; SetupWizard checks auth itself. */}
        <Route path="/setup" element={<SetupWizard />} />
        <Route element={<AuthGuard />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/routines" element={<RoutinesPage />} />
          <Route path="/log/training" element={<LogTraining />} />
          <Route path="/log/nutrition" element={<LogNutrition />} />
          <Route path="/log/supplements" element={<LogSupplements />} />
          <Route path="/log/sleep" element={<LogSleep />} />
          <Route path="/log/subjective" element={<LogSubjective />} />
          <Route path="/log/weight" element={<LogWeight />} />
          <Route path="/macros" element={<MacroTrackerPage />} />
          <Route path="/weekly" element={<WeeklySummary />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
