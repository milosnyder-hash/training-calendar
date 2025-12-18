import { addDays, differenceInDays } from "date-fns";
import {
  PlanDay,
  Segment,
  WorkoutType,
  pelotonLoadEq,
} from "./types";

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

function getPhase(date: Date, start: Date, race: Date): DayPlan["phase"] {
  const total = differenceInDays(race, start);
  const fromStart = differenceInDays(date, start);
  const pct = fromStart / total;

  if (pct < 0.35) return "BASE";
  if (pct < 0.75) return "BUILD";
  if (pct < 0.9) return "PEAK";
  return "TAPER";
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

  // rolling load buffer (10-day)
  const loadHistory: number[] = [];

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
      differenceInDays(date, start) /
      differenceInDays(race, start);
    const target10DayLoad =
      starting10DayLoad +
      (targetPeak10DayLoad - starting10DayLoad) *
        Math.min(1, Math.max(0, progress));

    const daysToRace = differenceInDays(race, date);

    let workoutType: WorkoutType = "REST";
    let segments: Segment[] | undefined;
    let loadEq = 0;

    /* ---------- workday rules ---------- */
    if (isWorkday) {
      if (qualityCountThisWeek < 2 && daysToRace > 5) {
        workoutType = "PELOTON_QUALITY_T";
        loadEq = pelotonLoadEq("PELOTON_QUALITY_T");
      } else {
        workoutType = "PELOTON_EASY";
        loadEq = pelotonLoadEq("PELOTON_EASY");
      }

      if (dayOfWeek === 2 || dayOfWeek === 4) {
        workoutType = "STRENGTH";
        loadEq = 0;
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
        workoutType = "RUN_QUALITY_LONG";

        const phaseFrac =
          phase === "BASE" ? 0.22 :
          phase === "BUILD" ? 0.25 :
          phase === "PEAK" ? 0.28 :
          0.2;

        const longMiles = Math.max(
          5,
          target10DayLoad * phaseFrac * (7 / 10)
        );

        lastLongRunMiles = longMiles;

        segments = [
          {
            label: "Long run",
            distanceMi: Number(longMiles.toFixed(1)),
            pace: "9:35 / mi–10:23 / mi",
          },
        ];

        loadEq = longMiles;
        longRunThisWeek = true;
        qualityCountThisWeek += 1;
      }

      // QUALITY T
      else if (qualityCountThisWeek < 2 && daysToRace > 5) {
        workoutType = "RUN_QUALITY_T";

        const total = Math.max(6, target10DayLoad * 0.15);

        segments = [
          { label: "Warmup", distanceMi: total * 0.25 },
          { label: "Threshold", distanceMi: total * 0.55 },
          { label: "Cooldown", distanceMi: total * 0.2 },
        ].map(s => ({
          ...s,
          distanceMi: Number(s.distanceMi!.toFixed(1)),
          pace:
            s.label === "Threshold"
              ? "8:29 / mi–8:41 / mi"
              : "9:35 / mi–10:23 / mi",
        }));

        loadEq = total;
        qualityCountThisWeek += 1;
      }

      // EASY RUN
      else {
        workoutType = "RUN_EASY";

        const easyMiles = Math.min(
          lastLongRunMiles * 0.75,
          Math.max(3, target10DayLoad * 0.1)
        );

        segments = [
          {
            label: "Easy run",
            distanceMi: Number(easyMiles.toFixed(1)),
            pace: "9:35 / mi–10:23 / mi",
          },
        ];

        loadEq = easyMiles;
      }
    }

    // update rolling load
    loadHistory.push(loadEq);
    if (loadHistory.length > 10) loadHistory.shift();

    plan.push({
      date: dateStr,
      isWorkday,
      phase,
      workout: {
        type: workoutType,
        segments,
        loadEq,
      },
    });
  }

  return plan;
}
