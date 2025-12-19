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
  if (phase === "BUILD") return 2;
  if (phase === "TAPER") return 1;
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

function hasSegmentLabel(segments: Segment[], label: string) {
  for (const segment of segments) {
    if (segment.label === label) return true;
  }
  return false;
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

  const EASY_PACE = "9:35 / mi–10:23 / mi";
  const THRESHOLD_PACE = "8:29 / mi–8:41 / mi";
  const INTERVAL_PACE = "8:05 / mi–8:17 / mi";

  const downgradeDayToEasy = (
    day: PlanDay,
    longRunTargetMiles: number,
    weeklyTargetMiles: number
  ) => {
    if (day.workoutType === "peloton") {
      day.pelotonType = "easy";
      day.pelotonLoadEq = 2.5;
      day.isQualityDay = false;
      day.totalLoadEq = computeTotalLoad(day.runLoadEq, day.pelotonLoadEq);
      return;
    }
    if (day.workoutType === "run") {
      const easyMilesRaw = Math.min(
        longRunTargetMiles * 0.75,
        Math.max(3, weeklyTargetMiles * 0.1)
      );
      const easyMiles = capBelowLongRun(easyMilesRaw, longRunTargetMiles);
      const safeMiles = Number.isFinite(easyMiles) ? easyMiles : 3;
      const cappedMiles = Number.isFinite(day.runDistanceMi)
        ? Math.min(day.runDistanceMi, safeMiles)
        : safeMiles;
      day.segments = [
        {
          label: "Easy Run",
          distanceMi: roundDistance(cappedMiles),
          pace: EASY_PACE,
        },
      ];
      day.runDistanceMi = sumRunDistance(day.segments);
      day.runLoadEq = day.runDistanceMi;
      day.isQualityDay = false;
      day.isLongRun = false;
      day.totalLoadEq = computeTotalLoad(day.runLoadEq, day.pelotonLoadEq);
    }
  };

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
  let baseWeeklyTargetMiles = 0;
  let baseWeeksSinceIncrease = 0;
  let qualityRotationIndex = 0;

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
    let longRunTargetMiles = deriveLongRunMiles(phase, weeklyTargetMiles);
    if (phase === "BASE") {
      longRunTargetMiles = Math.min(longRunTargetMiles, weeklyTargetMiles * 0.25);
    }
    longRunTargetMiles = roundDistance(Math.max(5, longRunTargetMiles));

    const recentDays = plan.slice(Math.max(0, plan.length - 6));
    let recentQualityCount = recentDays.filter((day) => day.isQualityDay).length;
    const recentLongRunCount = recentDays.filter((day) => day.isLongRun).length;
    let recentNonLongQualityCount = recentDays.filter(
      (day) => day.isQualityDay && !day.isLongRun
    ).length;
    const recentThresholdCount = recentDays.filter(
      (day) => day.workoutType === "run" && hasSegmentLabel(day.segments, "Threshold")
    ).length;
    const prevDay = plan.length > 0 ? plan[plan.length - 1] : null;
    let prevQualityDay = Boolean(prevDay && prevDay.isQualityDay);

    const weekQualityMax = qualityMaxForPhase(phase);

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

        const canAddNonLongQuality =
          phase === "BUILD" || phase === "PEAK" || phase === "TAPER"
            ? recentNonLongQualityCount === 0
            : false;
        const taperQualityAllowed = phase !== "TAPER" || daysToRace > 6;
        const canBeQuality =
          !prevQualityDay &&
          phase !== "BASE" &&
          recentQualityCount < weekQualityMax &&
          daysToRace > 3 &&
          taperQualityAllowed &&
          canAddNonLongQuality;

        if (canBeQuality) {
          pelotonType = "quality";
          pelotonLoadEq = 4.5;
          isQualityDay = true;
        }
      }
    } else {
      workoutType = "run";

      const hasLongRunInWindow = recentLongRunCount > 0;
      if (!hasLongRunInWindow && prevQualityDay && !hasFutureRunDay && prevDay) {
        const wasQuality = prevDay.isQualityDay;
        const wasNonLongQuality = prevDay.isQualityDay && !prevDay.isLongRun;
        downgradeDayToEasy(prevDay, longRunTargetMiles, weeklyTargetMiles);
        if (wasQuality) {
          recentQualityCount = Math.max(0, recentQualityCount - 1);
        }
        if (wasNonLongQuality) {
          recentNonLongQualityCount = Math.max(0, recentNonLongQualityCount - 1);
        }
        prevQualityDay = false;
      }
      const taperLongRunBlocked =
        phase === "TAPER" && daysToRace <= 6 && !isRaceDay;
      const canScheduleLongRun =
        !prevQualityDay && !hasLongRunInWindow && !taperLongRunBlocked;

      if (isRaceDay) {
        const raceMiles = roundDistance(Math.max(5, raceDistanceMiles));
        if (canScheduleLongRun) {
          segments = [
            {
              label: "Long Run",
              distanceMi: raceMiles,
              pace: EASY_PACE,
            },
          ];
          runLoadEq = raceMiles;
          isLongRun = true;
          isQualityDay = true;
        } else {
          const taperThresholdAllowed =
            phase !== "TAPER" ||
            daysToRace > 9 ||
            (daysToRace <= 9 && recentThresholdCount === 0);
          if (taperThresholdAllowed) {
            segments = [
              {
                label: "Threshold",
                distanceMi: raceMiles,
                pace: THRESHOLD_PACE,
              },
            ];
            runLoadEq = raceMiles;
            isQualityDay = true;
          } else {
            segments = [
              {
                label: "Easy Run",
                distanceMi: raceMiles,
                pace: EASY_PACE,
              },
            ];
            runLoadEq = raceMiles;
          }
        }
      } else if (weekIndex === raceWeekIndex && daysToRace > 0) {
        const easyMilesRaw = Math.min(
          longRunTargetMiles * 0.65,
          Math.max(3, weeklyTargetMiles * 0.08)
        );
        const easyMiles = capBelowLongRun(easyMilesRaw, longRunTargetMiles);

        const safeMiles = Number.isFinite(easyMiles) ? easyMiles : 3;

        segments = [
          {
            label: "Easy Run",
            distanceMi: roundDistance(safeMiles),
            pace: EASY_PACE,
          },
        ];

        runLoadEq = safeMiles;
      } else if (canScheduleLongRun) {
        let longMiles = longRunTargetMiles;
        if (weekIndex === raceWeekIndex) {
          longMiles = Math.min(longMiles, raceDistanceMiles);
        }

        longMiles = roundDistance(Math.max(5, longMiles));

        segments = [
          {
            label: "Long Run",
            distanceMi: roundDistance(longMiles),
            pace: EASY_PACE,
          },
        ];

        runLoadEq = Number.isFinite(longMiles) ? longMiles : 0;
        isLongRun = true;
        isQualityDay = true;
      } else {
        const canAddNonLongQuality =
          phase === "BUILD" || phase === "PEAK" || phase === "TAPER"
            ? recentNonLongQualityCount === 0
            : false;
        const taperQualityAllowed = phase !== "TAPER" || daysToRace > 6;
        const taperThresholdAllowed =
          phase !== "TAPER" ||
          daysToRace > 9 ||
          (daysToRace <= 9 && recentThresholdCount === 0);
        const canBeQualityRun =
          phase !== "BASE" &&
          !prevQualityDay &&
          recentQualityCount < weekQualityMax &&
          daysToRace > 3 &&
          taperQualityAllowed &&
          canAddNonLongQuality &&
          taperThresholdAllowed;

        if (canBeQualityRun) {
          let runTypeLabel = "Threshold";
          if (phase === "BUILD") {
            const rotation = ["Threshold", "Intervals"];
            runTypeLabel = rotation[qualityRotationIndex % rotation.length];
            qualityRotationIndex += 1;
          }
          if (phase === "PEAK") {
            runTypeLabel = "Threshold";
          }
          if (phase === "TAPER") {
            runTypeLabel = "Threshold";
          }

          const totalRaw = Math.max(5, weeklyTargetMiles * 0.15);
          const total = capBelowLongRun(totalRaw, longRunTargetMiles);

          segments = [
            {
              label: runTypeLabel,
              distanceMi: roundDistance(total),
              pace: runTypeLabel === "Intervals" ? INTERVAL_PACE : THRESHOLD_PACE,
            },
          ];

          runLoadEq = Number.isFinite(total) ? total : 0;
          isQualityDay = true;
        } else {
          const easyMilesRaw = Math.min(
            longRunTargetMiles * 0.75,
            Math.max(3, weeklyTargetMiles * 0.1)
          );
          const easyMiles = capBelowLongRun(easyMilesRaw, longRunTargetMiles);

          const safeMiles = Number.isFinite(easyMiles) ? easyMiles : 3;

          segments = [
            {
              label: "Easy Run",
              distanceMi: roundDistance(safeMiles),
              pace: EASY_PACE,
            },
          ];

          runLoadEq = safeMiles;
        }
      }
    }

    if (isQualityDay && prevQualityDay) {
      if (workoutType === "peloton") {
        pelotonType = "easy";
        pelotonLoadEq = 2.5;
      }
      if (workoutType === "run") {
        const easyMilesRaw = Math.min(
          longRunTargetMiles * 0.75,
          Math.max(3, weeklyTargetMiles * 0.1)
        );
        const easyMiles = capBelowLongRun(easyMilesRaw, longRunTargetMiles);
        const safeMiles = Number.isFinite(easyMiles) ? easyMiles : 3;
        segments = [
          {
            label: "Easy Run",
            distanceMi: roundDistance(safeMiles),
            pace: EASY_PACE,
          },
        ];
        runLoadEq = safeMiles;
        isLongRun = false;
      }
      isQualityDay = false;
    }

    const qualityWindowCount = recentQualityCount + (isQualityDay ? 1 : 0);
    if (qualityWindowCount > weekQualityMax && isQualityDay) {
      if (isLongRun) {
        let downgradedPrior = false;
        for (let j = plan.length - 1; j >= 0 && plan.length - j <= 6; j -= 1) {
          const day = plan[j];
          if (day.isQualityDay && !day.isLongRun) {
            downgradeDayToEasy(day, longRunTargetMiles, weeklyTargetMiles);
            downgradedPrior = true;
            break;
          }
        }
        if (!downgradedPrior) {
          if (workoutType === "peloton") {
            pelotonType = "easy";
            pelotonLoadEq = 2.5;
          }
          if (workoutType === "run") {
            const easyMilesRaw = Math.min(
              longRunTargetMiles * 0.75,
              Math.max(3, weeklyTargetMiles * 0.1)
            );
            const easyMiles = capBelowLongRun(easyMilesRaw, longRunTargetMiles);
            const safeMiles = Number.isFinite(easyMiles) ? easyMiles : 3;
            segments = [
              {
                label: "Easy Run",
                distanceMi: roundDistance(safeMiles),
                pace: EASY_PACE,
              },
            ];
            runLoadEq = safeMiles;
            isLongRun = false;
          }
          isQualityDay = false;
        }
      } else {
        if (workoutType === "peloton") {
          pelotonType = "easy";
          pelotonLoadEq = 2.5;
        }
        if (workoutType === "run") {
          const easyMilesRaw = Math.min(
            longRunTargetMiles * 0.75,
            Math.max(3, weeklyTargetMiles * 0.1)
          );
          const easyMiles = capBelowLongRun(easyMilesRaw, longRunTargetMiles);
          const safeMiles = Number.isFinite(easyMiles) ? easyMiles : 3;
          segments = [
            {
              label: "Easy Run",
              distanceMi: roundDistance(safeMiles),
              pace: EASY_PACE,
            },
          ];
          runLoadEq = safeMiles;
        }
        isQualityDay = false;
      }
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
