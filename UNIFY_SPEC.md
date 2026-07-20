# Option 3: Unified App — Merge FitTrack UI into Coach

## Goal
Port FitTrack's workout tracking UI (ExerciseSelector, WorkoutTracker, RestTimer, WeeklyRoutines, WorkoutHistory) into the fitness-activity-coach app as a "Training" tab. One app, one project, one schema, one login.

## Architecture
```
Coach App (single unified SPA)
├── Dashboard       (existing — compliance dots, recommendations)
├── Log             (existing — nutrition, sleep, supplements, subjective, weight)
│   └── Training   NEW — WorkoutTracker (live set-by-set logging)
├── Macros          (existing — AI macro tracker)
├── Weekly          (existing — weekly summary with evaluation)
├── Settings        (existing)
└── NavBar adds "Training" tab (Dumbbell icon, between Home and Log)
```

## Data Strategy
- Direct Supabase CRUD (no localStorage layer — Coach is cloud-first)
- Uses the already-merged schema (workouts / workout_exercises / workout_sets / workout_cardio / routines / routine_items)
- Uses Coach's existing AuthContext for user identity
- Uses Coach's existing db.ts pattern (raw SQL or supabase client directly)
- The Postgres trigger (migration 006) auto-summarizes completed workouts into daily_logs + exercise_logs

## Files to Port from FitTrack → Coach

### Data files → src/lib/
1. `src/data/exercises.ts` → `src/lib/fittrack-exercises.ts` — rename to avoid confusion with Coach's exercise DB
2. `src/data/cardioEquipment.ts` → `src/lib/fittrack-cardio.ts`

### Repository layer → src/lib/ (added to db.ts or new file)
3. `src/services/cloud/workoutsRepository.ts` → `src/lib/workout-repo.ts` — direct Supabase CRUD, adapted to db.ts style
4. `src/services/cloud/workoutMappers.ts` → `src/lib/workout-mappers.ts`
5. `src/services/cloud/workoutCardioRepository.ts` (if separate) or inline in repo

### Components (port CSS → Tailwind, drop Capacitor hooks)
6. `src/components/WorkoutTracker.tsx` → `src/pages/TrainingPage.tsx` — main workout logging page
7. `src/components/ExerciseSelector.tsx` → `src/components/ExerciseSelector.tsx` — browse/search exercises by muscle group
8. `src/components/RestTimer.tsx` → `src/components/RestTimer.tsx` — countdown between sets
9. `src/components/WeeklyRoutines.tsx` → `src/pages/RoutinesPage.tsx` — weekly schedule per day
10. `src/components/WorkoutHistory.tsx` → `src/components/WorkoutHistory.tsx` — past completed workouts

### Integration
11. `src/App.tsx` — add `/training` and `/routines` routes
12. `src/components/NavBar.tsx` — add "Training" tab with Dumbbell icon
13. No auth changes needed — Coach's AuthContext already handles this

## Component Details

### TrainingPage.tsx (replaces FitTrack's App.tsx workout logic)
- Full page with 3 sub-modes: LOG (active workout), HISTORY (past workouts), ROUTINES (weekly schedule)
- Default mode depends on whether there's an active workout today
- Uses Coach's existing dark theme with Tailwind classes
- State management: tracks exercises[], cardioExercises[], activeSet for logging

### ExerciseSelector.tsx
- Muscle group filter buttons (Chest, Back, Shoulders, Arms, Legs, Abs, Cardio)
- Scrollable list of exercises
- "Add to workout" button per exercise
- Uses `fittrack-exercises.ts` data
- Styled as Tailwind cards matching Coach's design system

### RestTimer.tsx
- Starts automatically when a set is completed
- Shows countdown with circular progress (CSS conic-gradient)
- Configurable default time from user_settings (90s default)
- Pause/reset controls
- Plays notification when done (CSS animation, no sound)

### WorkoutHistory.tsx
- List of past workouts grouped by date
- Expandable per-workout: shows exercises, sets, reps, weight, RIR
- Tap to view details

### RoutinesPage.tsx
- Day-of-week grid (Mon-Fri)
- Each day: tap to edit exercises, sets, reps, weight targets
- "Start Workout from Routine" button — creates a new active workout pre-populated

## States to Handle

### TrainingPage
- **No active workout today**: show "Start Workout" CTA + history preview
- **Active workout in progress**: show ExerciseSelector (add exercises) + WorkoutTracker (log sets)
- **Completing workout**: confirmation dialog → trigger status='completed' → trigger auto-summary
- **No exercises added yet**: empty state with "Add exercises" prompt
- **Error**: Supabase connection error, show retry button
- **Loading**: skeleton while loading today's workout from Supabase

### ExerciseSelector
- **Loading**: spinner while exercise data loads (static data so virtually instant)
- **Empty filter results**: "No exercises found" when muscle group filter has no matching exercises
- **Exercise already in workout**: show checkmark + "Already added" instead of "Add" button

### RestTimer
- **Not running**: show "Ready" state with start button
- **Running**: countdown display, cancel button
- **Finished**: flash/done indicator, auto-dismiss after 3 seconds

### WorkoutHistory
- **Empty**: "No workouts logged yet. Complete your first workout to see it here."
- **Loaded**: scrollable list grouped by week
- **Error**: network error fetching history

### RoutinesPage
- **Empty routine for a day**: "Set up your Monday routine" prompt
- **All days empty**: full week setup wizard
- **Saving**: spinner while upserting to Supabase

## File List to Create in fitness-activity-coach/

NEW:
```
src/pages/TrainingPage.tsx
src/pages/RoutinesPage.tsx
src/components/ExerciseSelector.tsx
src/components/RestTimer.tsx
src/components/WorkoutHistory.tsx
src/lib/fittrack-exercises.ts
src/lib/fittrack-cardio.ts
src/lib/workout-repo.ts
src/lib/workout-mappers.ts
```

MODIFIED:
```
src/App.tsx              — add /training and /routines routes
src/components/NavBar.tsx — add Training tab with Dumbbell icon
src/lib/types.ts         — add FitTrack types (WorkoutState, WorkoutExercise, SetRecord, CardioEquipment, etc.)
```

## TypeScript Types to Add to src/lib/types.ts

```typescript
// FitTrack types for workout tracking
export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
}

export interface SetRecord {
  reps: number;
  weight: number;
  rir: number | null;
  completed: boolean;
}

export interface WorkoutExercise {
  exercise: Exercise;
  sets: SetRecord[];
  targetSets: number;
  targetReps: number;
  targetWeight: number;
}

export interface CardioEquipment {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface CardioWorkoutExercise {
  equipment: CardioEquipment;
  durationMinutes: number;
  distanceMiles: number;
}

export interface WorkoutState {
  exercises: WorkoutExercise[];
  cardioExercises: CardioWorkoutExercise[];
  date: string;
}

export interface WorkoutHistoryEntry extends WorkoutState {
  id: string;
  loggedAt: string;
  totalSets: number;
  completedSets: number;
  totalCardioMinutes: number;
  totalCardioMiles: number;
}

export interface RoutineExercise {
  exercise: Exercise;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
}

export interface RoutineCardioExercise {
  equipment: CardioEquipment;
  durationMinutes: number;
  distanceMiles: number;
}

export interface DailyRoutine {
  day: string;
  name: string;
  exercises: RoutineExercise[];
  cardioExercises: RoutineCardioExercise[];
}

export type Weekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
```

## Design System
- Use Tailwind classes matching the Coach's existing dark theme
- Colors: bg-gray-900 background, emerald-500 for primary actions, amber-500 for warnings, text-white/gray-300
- Same NavBar height/spacing as existing
- Mobile-first: max-w-lg, full-width on phone
- Same font family and sizing as existing pages
- Card headers use the PageHeader component pattern
- Loading spinners use lucide-react Loader2
- Icons from lucide-react (Dumbbell for Training tab)
