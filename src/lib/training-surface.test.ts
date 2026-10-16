import { describe, expect, it } from 'vitest';
import {
  applyWeekPreview,
  bestE1rm,
  buildMonthGrid,
  buildScorecard,
  copyDay,
  estimateE1rm,
  estimateSessionMinutes,
  exerciseCue,
  muscleBalance,
  previewNextWeek,
  strengthHistory,
  substituteExercises,
  toCsv,
  type PlanDayDraft,
  type ScoredExercise,
} from './training-surface';

const bench: ScoredExercise = {
  id: 'bench-press',
  name: 'Bench Press',
  muscleGroup: 'Chest',
  sets: [
    { reps: 8, weight: 185, completed: true, rir: 1 },
    { reps: 6, weight: 185, completed: true, rir: 0 },
  ],
};

describe('estimated 1RM and scorecard', () => {
  it('uses Epley and ignores warmup and high-rep sets', () => {
    expect(estimateE1rm(100, 10)).toBe(133.3);
    expect(estimateE1rm(100, 30)).toBeNull();
    expect(bestE1rm([{ reps: 5, weight: 200, completed: true, setType: 'warmup' }])).toBeNull();
  });

  it('counts volume, completed work, and a record only when today beats the prior best', () => {
    const card = buildScorecard([bench], {
      startedAt: '2026-10-16T15:00:00.000Z',
      finishedAt: '2026-10-16T16:00:00.000Z',
      restSeconds: 600,
      priorBest: { 'bench-press': 200 },
    });
    expect(card.volumeLb).toBe(185 * 8 + 185 * 6);
    expect(card.completedSets).toBe(2);
    expect(card.elapsedSeconds).toBe(3600);
    expect(card.liftingSeconds).toBe(3000);
    expect(card.recordsBroken).toEqual(['Bench Press']);
  });

  it('does not call a first logged set a broken record when there is no prior best', () => {
    const card = buildScorecard([bench], { priorBest: {} });
    expect(card.recordsBroken).toEqual([]);
  });
});

describe('muscle balance and strength history', () => {
  it('splits arms by the exercise name and ignores warmup sets', () => {
    const result = muscleBalance([
      bench,
      {
        id: 'curl',
        name: 'Cable Bicep Curl',
        muscleGroup: 'Arms',
        sets: [{ reps: 12, weight: 30, completed: true, setType: 'working' }],
      },
      {
        id: 'pushdown',
        name: 'Rope Tricep Pushdown',
        muscleGroup: 'Arms',
        sets: [{ reps: 12, weight: 40, completed: true, setType: 'warmup' }],
      },
    ]);
    expect(result.movement).toEqual({ push: 2, pull: 1, legs: 0, other: 0 });
    expect(result.byMuscle[0]).toEqual({ muscle: 'Chest', sets: 2 });
  });

  it('keeps one point per session that has a working estimated max', () => {
    const points = strengthHistory(
      [
        { date: '2026-10-02', exercises: [bench] },
        { date: '2026-10-09', exercises: [{ ...bench, sets: [{ reps: 5, weight: 205, completed: true }] }] },
      ],
      'bench-press',
    );
    expect(points.map((point) => point.date)).toEqual(['2026-10-02', '2026-10-09']);
    expect(points[1].weight).toBe(205);
  });
});

describe('plans', () => {
  const day: PlanDayDraft = {
    weekIndex: 1,
    dayIndex: 0,
    weekday: 'Monday',
    name: 'Push',
    restDay: false,
    exercises: [
      {
        exerciseId: 'bench-press',
        name: 'Bench Press',
        muscleGroup: 'Chest',
        equipment: 'Barbell',
        logType: 'weight_reps',
        restSeconds: 120,
        supersetGroup: null,
        notes: '',
        sets: [
          { setIndex: 1, setType: 'working', reps: 8, weight: 185, durationSeconds: null, restSeconds: 120 },
          { setIndex: 2, setType: 'working', reps: 8, weight: 185, durationSeconds: null, restSeconds: 120 },
        ],
      },
    ],
  };

  it('estimates minutes from work plus rest and copies a day without mutating the source', () => {
    expect(estimateSessionMinutes(day)).toBe(Math.round((2 * 40 + 2 * 120) / 60));
    const copied = copyDay([day], day, 2, 1);
    expect(copied).toHaveLength(2);
    expect(copied[1].weekIndex).toBe(2);
    copied[1].exercises[0].sets[0].weight = 0;
    expect(day.exercises[0].sets[0].weight).toBe(185);
  });

  it('adds a rep when RIR is high and does not apply the preview until asked', () => {
    const changes = previewNextWeek([day], 1, {
      'bench-press': [
        { reps: 8, weight: 185, completed: true, rir: 3 },
        { reps: 8, weight: 185, completed: true, rir: 4 },
      ],
    });
    expect(changes[0].to).toContain('9');
    expect(day.exercises[0].sets[0].reps).toBe(8);
    const next = applyWeekPreview(
      [{ ...day, weekIndex: 2 }],
      1,
      changes,
    );
    expect(next[0].exercises[0].sets[0].reps).toBe(9);
  });

  it('deloads when reps were short and the set was near failure', () => {
    const changes = previewNextWeek([day], 1, {
      'bench-press': [{ reps: 5, weight: 185, completed: true, rir: 0 }],
    });
    expect(changes[0].reason).toMatch(/Deload/);
    expect(changes[0].sets[0].weight).toBe(165);
  });
});

describe('exercise detail, calendar, and csv', () => {
  it('writes an original cue and lists a different-equipment substitute', () => {
    const exercise = { id: 'barbell-bench', name: 'Barbell Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' };
    expect(exerciseCue(exercise)).toMatch(/shoulders/i);
    expect(exerciseCue(exercise)).not.toMatch(/JEFIT|jefit/);
    const subs = substituteExercises(exercise, [
      exercise,
      { id: 'db-bench', name: 'Dumbbell Bench Press', muscleGroup: 'Chest', equipment: 'Dumbbell' },
      { id: 'row', name: 'Row', muscleGroup: 'Back', equipment: 'Cable' },
    ]);
    expect(subs.map((item) => item.id)).toEqual(['db-bench']);
  });

  it('starts the month grid on Monday in local dates', () => {
    const grid = buildMonthGrid(2026, 9);
    expect(grid[0].date).toBe('2026-09-28');
    expect(grid.find((cell) => cell.date === '2026-10-01')?.inMonth).toBe(true);
  });

  it('quotes csv cells that contain commas', () => {
    expect(toCsv(['note'], [['hello, "gym"']])).toBe('note\n"hello, ""gym"""');
  });
});
