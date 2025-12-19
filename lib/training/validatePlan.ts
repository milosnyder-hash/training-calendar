import { PlanDay } from "./generatePlan";

/* ---------- helpers ---------- */

function safeNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dayLoadEq(day: PlanDay): number {
  if (day.workoutType === "run") {
    if (!Array.isArray(day.segments)) return 0;
    return day.segments.reduce(
      (sum: number, s: any) => sum + safeNum(s.distanceMi),
      0
    );
  }

  if (day.workoutType === "peloton") {
    return safeNum(day.pelotonLoadEq);
  }

  return 0;
}

/* ---------- validation ---------- */

export function validatePlan(
  plan: PlanDay[],
  starting10DayLoad: number
) {
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
  const counts: Record<string, number> = {};
  for (const d of plan) {
    counts[d.workoutType] = (counts[d.workoutType] ?? 0) + 1;
  }

  // Run-on-workday + max run streak
  let runOnWorkdayCount = 0;
  let maxRunStreak = 0;
  let currentStreak = 0;

  for (const d of plan) {
    const isRun = d.workoutType === "run";

    if (isRun && d.isWorkday) runOnWorkdayCount++;

    if (isRun) {
      currentStreak++;
      maxRunStreak = Math.max(maxRunStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // Phase ranges
  const phaseRanges: Record<string, { start: string; end: string }> = {};

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
