export type PaceSet = {
  easy: string;
  threshold: string;
  interval: string;
};

function minPerMileToString(minPerMile: number) {
  const min = Math.floor(minPerMile);
  const sec = Math.round((minPerMile - min) * 60);
  return `${min}:${String(sec).padStart(2, "0")} / mi`;
}

/**
 * Convert approximate VDOT to a 10K pace.
 * This is a regression fit against Daniels tables.
 */
function tenKPaceFromVDOT(vdot: number): number {
  // minutes per mile
  return 13.8 - 0.13 * vdot;
}

export function pacesFromVO2Max(vo2max: number): PaceSet {
  // Daniels-consistent proxy
  const vdot = vo2max - 3;

  // Anchor pace
  const tenK = tenKPaceFromVDOT(vdot);

  // Daniels rules of thumb
  const threshold = tenK + 0.25; // ~15 sec slower than 10K
  const interval = tenK - 0.15;  // ~9 sec faster than 10K
  const easyLow = threshold + 1.0;
  const easyHigh = threshold + 1.8;

  return {
    easy: `${minPerMileToString(easyLow)}–${minPerMileToString(
      easyHigh
    )}`,
    threshold: `${minPerMileToString(threshold - 0.1)}–${minPerMileToString(
      threshold + 0.1
    )}`,
    interval: `${minPerMileToString(interval - 0.1)}–${minPerMileToString(
      interval + 0.1
    )}`,
  };
}
