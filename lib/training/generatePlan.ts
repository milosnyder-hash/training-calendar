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
  pelotonType: "easy" | "quality" | null;
  isWorkday: boolean;
  segments: Segment[];
  runDistanceMi: number;
  runLoadEq: number;
  pelotonLoadEq: number;
  totalLoadEq: number;
  isLongRun: boolean;
  isQualityDay: boolean;
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

function deriveWeeklyTargetMiles(target10DayLoad: number): number {
  const miles = target10DayLoad * (7 / 10);
  return Number.isFinite(miles) ? miles : 0;
}

function deriveLongRunMiles(phase: WorkoutPhase, weeklyTargetMiles: number): number {
  const phaseFrac =
    phase === "BASE"
      ? 0.22
      : phase === "BUILD"
        ? 0.25
        : phase === "PEAK"
          ? 0.28
          : 0.2;

  const scaledMiles = weeklyTargetMiles * phaseFrac;
  const miles = Math.max(5, scaledMiles);
  return Number.isFinite(miles) ? miles : 5;
}

function capBelowLongRun(value: number, longRunMiles: number): number {
  if (!Number.isFinite(longRunMiles) || longRunMiles <= 0) return value;
  if (value < longRunMiles) return value;
  return Math.max(3, longRunMiles - 0.5);
}

function qualityMaxForPhase(phase: WorkoutPhase) {
  if (phase === "BASE") return 1;
  if (phase === "BUILD") return 3;
  return 2;
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
  const raceDistanceMiles = 8;

  const days: Date[] = [];
  for (let d = start; d <= race; d = addDays(d, 1)) {
    days.push(new Date(d));
  }

  const raceIndex = Math.max(0, days.length - 1);
  const raceWeekIndex = Math.floor(raceIndex / 7);

  const plan: PlanDay[] = [];

  const isWorkdayByIndex = days.map((day) =>
    Boolean(workdayMap[formatDate(day)])
  );

  const restDayIndices = new Set<number>();
  for (let i = 0; i < days.length; i += 7) {
    const weekIndices = [];
    for (let j = i; j < Math.min(days.length, i + 7); j++) {
      weekIndices.push(j);
    }
    const workdayIndex = weekIndices.find((idx) => isWorkdayByIndex[idx]);
    restDayIndices.add(workdayIndex ?? weekIndices[0]);
  }

  // weekly state
  let currentWeekIndex = -1;
  let longRunThisWeek = false;
  let qualityCountThisWeek = 0;
  let lastLongRunMiles = 5;
  let weekQualityMax = 1;
  let weekLongRunMiles = 0;
  let baseWeeklyTargetMiles = 0;
  let baseWeeksSinceIncrease = 0;
  let qualityRotationIndex = 0;
  let prevQualityDay = false;

  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const dateStr = formatDate(date);
    const isWorkday = isWorkdayByIndex[i];
    const phase = getPhase(date, start, race);
    const dayOfWeek = date.getDay(); // Sunday = 0
    const weekIndex = Math.floor(i / 7);
    const isRaceDay = i === raceIndex;

    const target10DayLoad = (() => {
      const progress =
        differenceInDays(date, start) /
        Math.max(1, differenceInDays(race, start));
      return (
        starting10DayLoad +
        (targetPeak10DayLoad - starting10DayLoad) *
          Math.min(1, Math.max(0, progress))
      );
    })();

    if (weekIndex !== currentWeekIndex) {
      currentWeekIndex = weekIndex;
      longRunThisWeek = false;
      qualityCountThisWeek = 0;
      weekLongRunMiles = 0;

      weekQualityMax = qualityMaxForPhase(phase);

      if (phase === "BASE") {
        if (baseWeeklyTargetMiles === 0 || baseWeeksSinceIncrease >= 2) {
          baseWeeklyTargetMiles = deriveWeeklyTargetMiles(target10DayLoad);
          baseWeeksSinceIncrease = 0;
        } else {
          baseWeeksSinceIncrease += 1;
        }
      } else {
        baseWeeklyTargetMiles = 0;
        baseWeeksSinceIncrease = 0;
      }
    }

    const daysToRace = differenceInDays(race, date);

    let workoutType: WorkoutCategory = "rest";
    let pelotonType: "easy" | "quality" | null = null;
    let segments: Segment[] = [];
    let runLoadEq = 0;
    let pelotonLoadEq = 0;
    let isLongRun = false;
    let isQualityDay = false;

    const isRestDay = restDayIndices.has(i);
    const hasFutureRunDay = (() => {
      const weekEnd = Math.min(days.length, (weekIndex + 1) * 7);
      for (let j = i + 1; j < weekEnd; j++) {
        if (restDayIndices.has(j)) continue;
        if (!isWorkdayByIndex[j]) return true;
      }
      return false;
    })();

    const weeklyTargetMilesRaw = deriveWeeklyTargetMiles(target10DayLoad);
    const weeklyTargetMiles =
      phase === "BASE" && baseWeeklyTargetMiles > 0
        ? baseWeeklyTargetMiles
        : weeklyTargetMilesRaw;
    const longRunCapMiles =
      weekIndex === raceWeekIndex ? raceDistanceMiles : weekLongRunMiles || lastLongRunMiles;

    if (isRestDay) {
      workoutType = "rest";
      isQualityDay = false;
    } else if (isWorkday) {
      if (dayOfWeek === 2 || dayOfWeek === 4) {
        workoutType = "strength";
      } else {
        workoutType = "peloton";
        pelotonType = "easy";
        pelotonLoadEq = 2.5;

        const canBeQuality =
          !prevQualityDay &&
          phase !== "BASE" &&
          qualityCountThisWeek < weekQualityMax &&
          daysToRace > 3;

        if (canBeQuality) {
          pelotonType = "quality";
          pelotonLoadEq = 4.5;
          qualityCountThisWeek += 1;
          isQualityDay = true;
        }
      }
    } else {
      workoutType = "run";

      if (isRaceDay) {
        const raceMiles = roundDistance(Math.max(5, raceDistanceMiles));
        segments = [
          {
            label: "Race",
            distanceMi: raceMiles,
            pace: "8:29 / mi–8:41 / mi",
          },
        ];
        runLoadEq = raceMiles;
        isLongRun = true;
        isQualityDay = true;
        longRunThisWeek = true;
        weekLongRunMiles = raceMiles;
        lastLongRunMiles = Math.max(lastLongRunMiles, raceMiles);
        qualityCountThisWeek += 1;
      } else if (weekIndex === raceWeekIndex && daysToRace > 0) {
        const easyMilesRaw = Math.min(
          longRunCapMiles * 0.65,
          Math.max(3, weeklyTargetMiles * 0.08)
        );
        const easyMiles = capBelowLongRun(
          easyMilesRaw,
          longRunCapMiles
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
      } else if (!longRunThisWeek) {
        if (prevQualityDay && !hasFutureRunDay) {
          const prevDay = plan[plan.length - 1];
          if (prevDay?.isQualityDay && prevDay.workoutType === "peloton") {
            prevDay.isQualityDay = false;
            prevDay.pelotonType = "easy";
            prevDay.pelotonLoadEq = 2.5;
            prevDay.totalLoadEq = computeTotalLoad(
              prevDay.runLoadEq,
              prevDay.pelotonLoadEq
            );
            qualityCountThisWeek = Math.max(0, qualityCountThisWeek - 1);
            prevQualityDay = false;
          }
          if (
            prevDay?.isQualityDay &&
            prevDay.workoutType === "run" &&
            !prevDay.isLongRun
          ) {
            prevDay.isQualityDay = false;
            const fallbackMilesRaw = Math.min(
              longRunCapMiles * 0.75,
              Math.max(3, weeklyTargetMiles * 0.1)
            );
            const fallbackMiles = capBelowLongRun(
              fallbackMilesRaw,
              longRunCapMiles
            );
            prevDay.segments = [
              {
                label: "Easy run",
                distanceMi: roundDistance(fallbackMiles),
                pace: "9:35 / mi–10:23 / mi",
              },
            ];
            prevDay.runDistanceMi = sumRunDistance(prevDay.segments);
            prevDay.runLoadEq = prevDay.runDistanceMi;
            prevDay.totalLoadEq = computeTotalLoad(
              prevDay.runLoadEq,
              prevDay.pelotonLoadEq
            );
            qualityCountThisWeek = Math.max(0, qualityCountThisWeek - 1);
            prevQualityDay = false;
          }
        }
      }

      if (!longRunThisWeek && !prevQualityDay) {
        let longMiles = deriveLongRunMiles(phase, weeklyTargetMiles);
        if (phase === "BASE") {
          longMiles = Math.min(longMiles, weeklyTargetMiles * 0.25);
        }

        longMiles = roundDistance(Math.max(5, longMiles));
        lastLongRunMiles = longMiles;
        weekLongRunMiles = longMiles;

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
        isQualityDay = true;
      } else {
        const canBeQualityRun =
          phase !== "BASE" &&
          !prevQualityDay &&
          qualityCountThisWeek < weekQualityMax &&
          daysToRace > 3;

        if (canBeQualityRun) {
          let runTypeLabel = "Threshold";
          if (phase === "BUILD") {
            const rotation = ["Threshold", "Interval", "Repetition", "Hill"];
            runTypeLabel = rotation[qualityRotationIndex % rotation.length];
            qualityRotationIndex += 1;
          }

          const totalRaw = Math.max(5, weeklyTargetMiles * 0.15);
          const total = capBelowLongRun(totalRaw, longRunCapMiles);

          const rawSegments: Segment[] = [
            { label: "Warmup", distanceMi: total * 0.25 },
            { label: runTypeLabel, distanceMi: total * 0.55 },
            { label: "Cooldown", distanceMi: total * 0.2 },
          ];

          segments = rawSegments.map((segment) => ({
            ...segment,
            distanceMi: roundDistance(segment.distanceMi ?? 0),
            pace:
              segment.label === "Threshold"
                ? "8:29 / mi–8:41 / mi"
                : "9:35 / mi–10:23 / mi",
          }));

          runLoadEq = Number.isFinite(total) ? total : 0;
          qualityCountThisWeek += 1;
          isQualityDay = true;
        } else {
          const easyMilesRaw = Math.min(
            longRunCapMiles * 0.75,
            Math.max(3, weeklyTargetMiles * 0.1)
          );
          const easyMiles = capBelowLongRun(
            easyMilesRaw,
            longRunCapMiles
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
    }

    if (isQualityDay && prevQualityDay) {
      isQualityDay = false;
    }

    const runDistanceMi = workoutType === "run" ? sumRunDistance(segments) : 0;
    const totalLoadEq = computeTotalLoad(runLoadEq, pelotonLoadEq);

    plan.push({
      date: dateStr,
      isWorkday,
      phase,
      workoutType,
      pelotonType,
      segments,
      runDistanceMi,
      runLoadEq,
      pelotonLoadEq,
      totalLoadEq,
      isLongRun,
      isQualityDay,
    });

    prevQualityDay = isQualityDay;
  }

  return plan;
}
