Read UNIFY_SPEC.md in this project carefully. This is the build spec for porting FitTrack's workout tracking UI into the Coach app.

First, read these reference files to understand current state:

From THIS project (fitness-activity-coach):
- src/App.tsx — route structure
- src/components/NavBar.tsx — nav bar pattern
- src/lib/types.ts — existing types
- src/lib/db.ts — DB operations pattern
- src/lib/evaluate.ts — existing evaluation engine
- src/components/NavBar.tsx — NavBar pattern with lucide icons
- src/pages/*.tsx — existing page patterns (especially MacroTrackerPage.tsx for complex page with multiple states)
- src/components/DayMacroSummary.tsx — component pattern

From C:\Users\tille\fitness-tracker-mobile (the FitTrack source to port):
- src/App.tsx — main app with all workout state management
- src/components/WorkoutTracker.tsx — live set logger
- src/components/ExerciseSelector.tsx — exercise browser
- src/components/RestTimer.tsx — rest timer
- src/components/WeeklyRoutines.tsx — routine setup
- src/components/WorkoutHistory.tsx — history view
- src/data/exercises.ts — 80+ exercises
- src/data/cardioEquipment.ts — cardio equipment
- src/services/cloud/workoutsRepository.ts — Supabase CRUD
- src/services/cloud/workoutMappers.ts — data mapping
- src/services/cloud/types.ts — DB row types
- src/types.ts — frontend types
- src/workoutLog.ts — workout logic helpers
- src/routines.ts — routine helpers
- src/App.css — existing CSS classes (convert these to Tailwind)

BUILD ALL of the following files. Use Tailwind CSS matching the Coach's existing dark theme (bg-gray-900, emerald-500 accents, etc.):

NEW FILES:
1. src/pages/TrainingPage.tsx — Workout logging page with 3 modes (active workout, history, routines)
2. src/pages/RoutinesPage.tsx — Weekly routine setup per day
3. src/components/WorkoutTracker.tsx — Live set logging (reps/weight/RIR entry)
4. src/components/ExerciseSelector.tsx — Exercise browser by muscle group
5. src/components/RestTimer.tsx — Countdown timer between sets
6. src/components/WorkoutHistory.tsx — Past completed workouts
7. src/lib/fittrack-exercises.ts — Exercise database (copy from FitTrack)
8. src/lib/fittrack-cardio.ts — Cardio equipment data (copy from FitTrack)
9. src/lib/workout-repo.ts — Supabase CRUD for workouts/exercises/sets/routines
10. src/lib/workout-mappers.ts — Data mapping between DB rows and frontend types

MODIFIED FILES:
11. src/lib/types.ts — Append FitTrack types (Exercise, SetRecord, WorkoutExercise, WorkoutState, WorkoutHistoryEntry, CardioEquipment, CardioWorkoutExercise, RoutineExercise, DailyRoutine, Weekday, etc.)
12. src/App.tsx — Add /training and /routines routes
13. src/components/NavBar.tsx — Add "Training" tab with Dumbbell icon between Home and Log tabs

CRITICAL IMPLEMENTATION DETAILS:
- All styling must be Tailwind (NOT CSS classes). The FitTrack source uses App.css with class names like "workout-tracker", "exercise-selector" etc. — convert ALL of those to Tailwind.
- Direct Supabase CRUD, no localStorage layer. Use the Coach's existing supabase client from src/lib/supabase.ts.
- Import supabase client as `import { supabase } from '~/lib/supabase'` (using the @ alias).
- Use Coach's AuthContext: `import { useAuth } from '~/context/AuthContext'` to get user.id.
- Use lucide-react icons (Dumbbell, Timer, History, List, Plus, Check, X, Play, Pause, etc.).
- The TrainingPage should show a toggle/segment-control at the top: [Workout] [History] [Routines].
- TrainingPage defaults to Workout mode. If no active workout today, show "Start Workout" CTA. When workout is active, show ExerciseSelector above WorkoutTracker.
- All components must handle loading, empty, and error states per the spec.
- The RestTimer uses setInterval with 1-second ticks — clean up with useEffect return.
- RoutinesPage shows all 5 training days (Mon-Fri) in a grid. Each day can be tapped to edit.
- All forms are controlled components (useState).

After creating ALL files, run: npm run build
Fix any TypeScript or build errors until the build passes cleanly.

DO NOT:
- Remove or edit any existing Coach pages or components (only modify types.ts, App.tsx, NavBar.tsx)
- Use any CSS files or import App.css
- Add any Capacitor or mobile-specific code
- Modify any Supabase schema or migration files