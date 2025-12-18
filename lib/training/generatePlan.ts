import { addDays, differenceInDays } from "date-fns";

/* ---------------- types ---------------- */

type WorkoutPhase = "BASE" | "BUILD" | "PEAK" | "TAPER";
type WorkoutCategory = "run" | "peloton" | "strength" | "rest";

interface Segment {
  label: string;
  distanceMi?: number;
  pace?: string;
}

export type PlanDay = {
  date: string;
  phase: WorkoutPhase;
  workoutType: WorkoutCategory;
  isWorkday: boolean;
  segments: Segment[];
  runDistanceMi: number;
  runLoadEq: number;
  pelotonLoadEq: number;
  totalLoadEq: number;
  isLongRun: boolean;
};

interface GeneratePlanArgs {
  startDate: string;
  raceDate: string;
  workdayMap: Record<string, boolean>;
  vo2max: number;
  starting10DayLoad: number;
  targetPeak10DayLoad: number;
}

/* ---------------- helpers ---------------- */

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getPhase(date: Date, start: Date, race: Date): WorkoutPhase {
  const total = differenceInDays(race, start);
  const fromStart = differenceInDays(date, start);
  const pct = total === 0 ? 0 : fromStart / total;

  if (pct < 0.35) return "BASE";
  if (pct < 0.75) return "BUILD";
  if (pct < 0.9) return "PEAK";
  return "TAPER";
}

function roundDistance(value: number) {
  return Number(value.toFixed(1));
}

function deriveLongRunMiles(
  phase: WorkoutPhase,
  target10DayLoad: number
): number {
  const phaseFrac =
    phase === "BASE"
      ? 0.22
      : phase === "BUILD"
        ? 0.25
        : phase === "PEAK"
          ? 0.28
          : 0.2;

  const scaledMiles = target10DayLoad * phaseFrac * (7 / 10);
  const miles = Math.max(5, scaledMiles);
  return Number.isFinite(miles) ? miles : 5;
}

function computeTotalLoad(runLoadEq: number, pelotonLoadEq: number): number {
  const run = Number.isFinite(runLoadEq) ? runLoadEq : 0;
  const peloton = Number.isFinite(pelotonLoadEq) ? pelotonLoadEq : 0;
  return run + peloton;
}

function sumRunDistance(segments: Segment[]): number {
  return segments.reduce((total, segment) => {
    const distance = Number.isFinite(segment.distanceMi)
      ? (segment.distanceMi as number)
      : 0;
    return total + distance;
  }, 0);
}

/* ---------------- main ---------------- */

export function generatePlan({
  startDate,
  raceDate,
  workdayMap,
  starting10DayLoad,
  targetPeak10DayLoad,
}: GeneratePlanArgs): PlanDay[] {
  const start = new Date(startDate);
  const race = new Date(raceDate);

  const days: Date[] = [];
  for (let d = start; d <= race; d = addDays(d, 1)) {
    days.push(new Date(d));
  }

  const plan: PlanDay[] = [];

  // weekly state
  let longRunThisWeek = false;
  let qualityCountThisWeek = 0;
  let lastLongRunMiles = 5;

  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const dateStr = formatDate(date);
    const isWorkday = Boolean(workdayMap[dateStr]);
    const phase = getPhase(date, start, race);
    const dayOfWeek = date.getDay(); // Sunday = 0

    // reset weekly counters on Sunday
    if (dayOfWeek === 0) {
      longRunThisWeek = false;
      qualityCountThisWeek = 0;
    }

    // rolling 10-day target load (linear ramp)
    const progress =
      differenceInDays(date, start) / Math.max(1, differenceInDays(race, start));
    const target10DayLoad =
      starting10DayLoad +
      (targetPeak10DayLoad - starting10DayLoad) *
        Math.min(1, Math.max(0, progress));

    const daysToRace = differenceInDays(race, date);

    let workoutType: WorkoutCategory = "rest";
    let segments: Segment[] = [];
    let runLoadEq = 0;
    let pelotonLoadEq = 0;
    let isLongRun = false;

    /* ---------- workday rules ---------- */
    if (isWorkday) {
      if (qualityCountThisWeek < 2 && daysToRace > 5) {
        workoutType = "peloton";
        pelotonLoadEq = 4.5;
      } else {
        workoutType = "peloton";
        pelotonLoadEq = 2.5;
      }

      if (dayOfWeek === 2 || dayOfWeek === 4) {
        workoutType = "strength";
        pelotonLoadEq = 0;
      }
    }

    /* ---------- non-workday rules ---------- */
    else {
      // LONG RUN (once per week)
      if (
        !longRunThisWeek &&
        daysToRace > 5 &&
        qualityCountThisWeek < 2
      ) {
        workoutType = "run";

        const longMiles = deriveLongRunMiles(phase, target10DayLoad);

        lastLongRunMiles = longMiles;

        segments = [
          {
            label: "Long run",
            distanceMi: roundDistance(longMiles),
            pace: "9:35 / mi–10:23 / mi",
          },
        ];

        runLoadEq = Number.isFinite(longMiles) ? longMiles : 0;
        longRunThisWeek = true;
        qualityCountThisWeek += 1;
        isLongRun = true;
      }

      // QUALITY T
      else if (qualityCountThisWeek < 2 && daysToRace > 5) {
        workoutType = "run";

        const total = Math.max(6, target10DayLoad * 0.15);

        const rawSegments: Segment[] = [
          { label: "Warmup", distanceMi: total * 0.25 },
          { label: "Threshold", distanceMi: total * 0.55 },
          { label: "Cooldown", distanceMi: total * 0.2 },
        ];

        segments = rawSegments.map(segment => ({
          ...segment,
          distanceMi: roundDistance(segment.distanceMi ?? 0),
          pace:
            segment.label === "Threshold"
              ? "8:29 / mi–8:41 / mi"
              : "9:35 / mi–10:23 / mi",
        }));

        runLoadEq = Number.isFinite(total) ? total : 0;
        qualityCountThisWeek += 1;
      }

      // EASY RUN
      else {
        workoutType = "run";

        const easyMiles = Math.min(
          lastLongRunMiles * 0.75,
          Math.max(3, target10DayLoad * 0.1)
        );

        const safeMiles = Number.isFinite(easyMiles) ? easyMiles : 3;

        segments = [
          {
            label: "Easy run",
            distanceMi: roundDistance(safeMiles),
            pace: "9:35 / mi–10:23 / mi",
          },
        ];

        runLoadEq = safeMiles;
      }
    }

    const runDistanceMi = workoutType === "run" ? sumRunDistance(segments) : 0;
    const totalLoadEq = computeTotalLoad(runLoadEq, pelotonLoadEq);

    plan.push({
      date: dateStr,
      isWorkday,
      phase,
      workoutType,
      segments,
      runDistanceMi,
      runLoadEq,
      pelotonLoadEq,
      totalLoadEq,
      isLongRun,
    });
  }

  return plan;
}
