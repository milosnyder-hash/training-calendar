import {
  PlanDay,
  Workout,
  WorkoutType,
  isPelotonWorkout,
  isRunWorkout,
  pelotonLoadEq,
} from "./types";

/* ---------- helpers ---------- */

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function runMilesFromWorkout(workout: Workout): number {
  if (!isRunWorkout(workout.type)) return 0;
  if (!Array.isArray(workout.segments)) return 0;

  return workout.segments.reduce(
    (sum: number, s: any) => sum + safeNum(s.distanceMi),
    0
  );
}

function dayLoadEq(day: PlanDay): number {
  return (
    runMilesFromWorkout(day.workout) +
    (isPelotonWorkout(day.workout.type)
      ? pelotonLoadEq(day.workout.type)
      : 0)
  );
}

/* ---------- validation ---------- */

export interface PlanValidation {
  rolling10DayTotalEq: number[];
  dailyLoadEq: number[];
  counts: Record<WorkoutType, number>;
  runOnWorkdayCount: number;
  maxRunStreak: number;
  phaseRanges: Partial<Record<PlanDay["phase"], { start: string; end: string }>>;
}

export function validatePlan(
  plan: PlanDay[],
  starting10DayLoad: number
): PlanValidation {
  // Daily load derived from FINAL workouts
  const dailyLoadEq: number[] = plan.map(dayLoadEq);

  // Rolling 10-day totals INCLUDING ghost history
  const rolling10DayTotalEq: number[] = [];
  const ghostDailyLoad = starting10DayLoad / 10;

  for (let i = 0; i < dailyLoadEq.length; i++) {
    let sum = 0;

    for (let j = i - 9; j <= i; j++) {
      if (j < 0) {
        // historical load before plan start
        sum += ghostDailyLoad;
      } else {
        sum += dailyLoadEq[j];
      }
    }

    rolling10DayTotalEq.push(sum);
  }

  // Workout counts
  const counts = {} as Record<WorkoutType, number>;
  for (const d of plan) {
    counts[d.workout.type] = (counts[d.workout.type] ?? 0) + 1;
  }

  // Run-on-workday + max run streak
  let runOnWorkdayCount = 0;
  let maxRunStreak = 0;
  let currentStreak = 0;

  for (const d of plan) {
    const isRun = isRunWorkout(d.workout.type);

    if (isRun && d.isWorkday) runOnWorkdayCount++;

    if (isRun) {
      currentStreak++;
      maxRunStreak = Math.max(maxRunStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // Phase ranges
  const phaseRanges: PlanValidation["phaseRanges"] = {};

  for (const d of plan) {
    if (!phaseRanges[d.phase]) {
      phaseRanges[d.phase] = { start: d.date, end: d.date };
    } else {
      phaseRanges[d.phase].end = d.date;
    }
  }

  return {
    rolling10DayTotalEq,
    dailyLoadEq, // useful for debugging / charts
    counts,
    runOnWorkdayCount,
    maxRunStreak,
    phaseRanges,
  };
}
