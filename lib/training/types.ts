export const RUN_WORKOUT_TYPES = [
  "RUN_EASY",
  "RUN_QUALITY_T",
  "RUN_QUALITY_I",
  "RUN_QUALITY_LONG",
] as const;

export const PELOTON_WORKOUT_TYPES = [
  "PELOTON_EASY",
  "PELOTON_QUALITY_T",
  "PELOTON_QUALITY_I",
] as const;

export const QUALITY_WORKOUT_TYPES = [
  "RUN_QUALITY_T",
  "RUN_QUALITY_I",
  "RUN_QUALITY_LONG",
  "PELOTON_QUALITY_T",
  "PELOTON_QUALITY_I",
] as const;

export type RunWorkoutType = (typeof RUN_WORKOUT_TYPES)[number];
export type PelotonWorkoutType = (typeof PELOTON_WORKOUT_TYPES)[number];
export type QualityWorkoutType = (typeof QUALITY_WORKOUT_TYPES)[number];
export type WorkoutType =
  | RunWorkoutType
  | PelotonWorkoutType
  | "STRENGTH"
  | "REST";

export interface Segment {
  label: string;
  distanceMi?: number;
  pace?: string;
  durationMin?: number;
}

export interface Workout {
  type: WorkoutType;
  segments?: Segment[];
  loadEq?: number;
}

export interface PlanDay {
  date: string;
  isWorkday: boolean;
  phase: "BASE" | "BUILD" | "PEAK" | "TAPER";
  workout: Workout;
}

export const PELOTON_LOAD_EQ: Record<PelotonWorkoutType, number> = {
  PELOTON_EASY: 2.5,
  PELOTON_QUALITY_T: 4.5,
  PELOTON_QUALITY_I: 5.5,
};

export function isRunWorkout(type: WorkoutType): type is RunWorkoutType {
  return RUN_WORKOUT_TYPES.includes(type as RunWorkoutType);
}

export function isPelotonWorkout(
  type: WorkoutType
): type is PelotonWorkoutType {
  return PELOTON_WORKOUT_TYPES.includes(type as PelotonWorkoutType);
}

export function isQualityWorkout(
  type: WorkoutType
): type is QualityWorkoutType {
  return QUALITY_WORKOUT_TYPES.includes(type as QualityWorkoutType);
}

export function pelotonLoadEq(type: PelotonWorkoutType): number {
  return PELOTON_LOAD_EQ[type];
}
