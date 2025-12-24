"use client";

import { useEffect, useState } from "react";
import { generatePlan } from "@/lib/training/generatePlan";
import type { PlanDay } from "@/lib/training/generatePlan";

const RACE_DATE = "2026-05-24";

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------- UI helpers ---------- */

const WORKOUT_COLORS: Record<string, string> = {
  run: "#e0ecff",
  peloton: "#daf5e9",
  strength: "#efe5ff",
  rest: "#f3f4f6",
};

const WORKOUT_TEXT_COLORS: Record<string, string> = {
  run: "#0b3b8a",
  peloton: "#1a6b43",
  strength: "#553c9a",
  rest: "#374151",
};

const WORKOUT_LABELS: Record<string, string> = {
  run: "Run",
  peloton: "Peloton",
  strength: "Strength",
  rest: "Rest",
};

function formatFriendlyDate(dateString: string | null | undefined) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).replace(",", " ·");
}

function workoutLabel(day: PlanDay) {
  if (day.workoutType === "peloton") {
    return day.pelotonType === "quality" ? "Peloton" : "Peloton";
  }
  return WORKOUT_LABELS[day.workoutType] ?? day.workoutType;
}

function WorkoutPill({ day }: { day: PlanDay }) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        background: WORKOUT_COLORS[day.workoutType] ?? "#eee",
        color: WORKOUT_TEXT_COLORS[day.workoutType] ?? "#111827",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: WORKOUT_TEXT_COLORS[day.workoutType] ?? "#111827",
          display: "inline-block",
        }}
      />
      {workoutLabel(day)}
    </span>
  );
}

function safeNumber(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function sumSegmentMiles(segments: any[]): number {
  return segments.reduce((sum, segment) => {
    if (segment && Number.isFinite(segment.distanceMi)) {
      return sum + segment.distanceMi;
    }
    return sum;
  }, 0);
}

type PlanStats = {
  rolling10DayTotalEq: number[];
  counts: Record<string, number>;
  runOnWorkdayCount: number;
  maxRunStreak: number;
  phaseRanges: Record<string, { start: string; end: string }>;
};

function buildPlanStats(plan: PlanDay[], starting10DayLoad: number): PlanStats {
  const dailyLoadEq = plan.map((day) => {
    const segments = Array.isArray(day.segments) ? day.segments : [];
    const workoutType = day.workoutType;

    if (workoutType === "run") {
      return sumSegmentMiles(segments);
    }

    if (workoutType === "peloton") {
      return safeNumber(day.pelotonLoadEq);
    }

    return 0;
  });

  const rolling10DayTotalEq: number[] = [];
  const ghostDailyLoad = safeNumber(starting10DayLoad) / 10;

  for (let i = 0; i < dailyLoadEq.length; i++) {
    let sum = 0;

    for (let j = i - 9; j <= i; j++) {
      if (j < 0) {
        sum += ghostDailyLoad;
      } else {
        sum += dailyLoadEq[j];
      }
    }

    rolling10DayTotalEq.push(sum);
  }

  const counts: Record<string, number> = {};
  let runOnWorkdayCount = 0;
  let maxRunStreak = 0;
  let currentStreak = 0;

  for (const day of plan) {
    const workoutType = day.workoutType;
    counts[workoutType] = (counts[workoutType] ?? 0) + 1;

    const isRun = workoutType === "run";
    const isWorkday = day.isWorkday;

    if (isRun && isWorkday) {
      runOnWorkdayCount++;
    }

    if (isRun) {
      currentStreak++;
      maxRunStreak = Math.max(maxRunStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const phaseRanges: Record<string, { start: string; end: string }> = {};

  for (const day of plan) {
    const phase = day.phase;
    const date = day.date;

    if (!date) continue;

    if (!phaseRanges[phase]) {
      phaseRanges[phase] = { start: date, end: date };
    } else {
      phaseRanges[phase].end = date;
    }
  }

  return {
    rolling10DayTotalEq,
    counts,
    runOnWorkdayCount,
    maxRunStreak,
    phaseRanges,
  };
}

function formatSegmentDetail(segment: any) {
  const parts: string[] = [];
  if (segment.label) parts.push(segment.label);
  if (Number.isFinite(segment.distanceMi)) {
    parts.push(`${segment.distanceMi.toFixed(1)} mi`);
  }
  if (segment.pace) {
    parts.push(`@ ${segment.pace}`);
  }
  if (segment.durationMin) {
    parts.push(`${segment.durationMin} min`);
  }
  return parts.join(" · ");
}

function WorkoutDetails({ day }: { day: PlanDay }) {
  const segments = Array.isArray(day.segments) ? day.segments : [];
  const workoutType = day.workoutType;
  const totalRunMiles = sumSegmentMiles(segments);
  const pelotonEq = safeNumber(day.pelotonLoadEq);

  if (workoutType === "rest") {
    return <span style={{ color: "#6b7280" }}>Rest day</span>;
  }

  if (workoutType === "peloton") {
    return (
      <span>
        {day.pelotonType === "quality" ? "Quality ride" : "Easy ride"} · Peloton
        {pelotonEq > 0 ? ` · Load ${pelotonEq.toFixed(1)} mi-eq` : ""}
      </span>
    );
  }

  if (workoutType === "strength") {
    return <span>Strength session</span>;
  }

  if (segments.length === 0) {
    return <span>Run</span>;
  }

  return (
    <span>
      {segments
        .map((s: any) => formatSegmentDetail(s))
        .filter(Boolean)
        .join(" | ")}
      {totalRunMiles > 0 && !segments.some((s: any) => s.distanceMi === totalRunMiles) ?
        ` · ${totalRunMiles.toFixed(1)} mi total` : ""}
    </span>
  );
}



/* ---------- page ---------- */

export default function PlanPage() {
  const [startDate, setStartDate] = useState(todayYYYYMMDD());
  const [vo2max, setVo2max] = useState(45);

  // ✅ new inputs
  const [starting10DayLoad, setStarting10DayLoad] = useState(25); // mi-eq
  const [targetPeak10DayLoad, setTargetPeak10DayLoad] = useState(55); // mi-eq

  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDay[] | null>(null);
  const [hasWorkdays, setHasWorkdays] = useState(false);

  useEffect(() => {
    setHasWorkdays(Boolean(localStorage.getItem("workdayMap")));
  }, []);

  function handleGenerate() {
    setError(null);

    try {
      const raw = localStorage.getItem("workdayMap");
      if (!raw) {
        throw new Error("No work calendar found. Please import it on /setup first.");
      }
      const workdayMap = JSON.parse(raw);

      const generatedPlan = generatePlan({
        startDate,
        raceDate: RACE_DATE,
        workdayMap,
        vo2max: Number(vo2max),
        starting10DayLoad: Number(starting10DayLoad),
        targetPeak10DayLoad: Number(targetPeak10DayLoad),
      });

      setPlan(generatedPlan);

    } catch (e: any) {
      setError(e.message || "Unknown error");
    }
  }

  const stats = plan ? buildPlanStats(plan, starting10DayLoad) : null;
  const phaseRanges = stats?.phaseRanges ?? null;

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1400,
        margin: "0 auto",
        color: "#0f172a",
        background: "#f8fafc",
        minHeight: "100vh",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Training Plan</h1>

      <p style={{ marginTop: 4, color: "#475569", lineHeight: 1.6 }}>
        Race day: <strong>{RACE_DATE}</strong> (8-mile event)
        <br />
        Runs avoid workdays; Peloton contributes <em>mile-equivalent</em> load so total stress stays realistic.
      </p>

      {/* Overview */}
      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 16 }}>Plan Overview</div>
        <div style={{ lineHeight: 1.6, color: "#334155" }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "#94a3b8" }}>
                Starting 10-day load
              </div>
              <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {starting10DayLoad} mi-eq
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "#94a3b8" }}>
                Target peak load
              </div>
              <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {targetPeak10DayLoad} mi-eq
              </div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Guiding rules:</strong> No run on workdays · Strength ~1×/week on workdays · Rest 1–2×/week
          </div>
          {phaseRanges && (
            <div style={{ marginTop: 8 }}>
              <strong>Phases (race-anchored):</strong>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {["BASE", "BUILD", "PEAK", "TAPER"].map((ph) => (
                  <li key={ph}>
                    {ph}: {phaseRanges[ph]?.start ?? "—"} → {phaseRanges[ph]?.end ?? "—"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        }}
      >
        <label>
          Start date
          <input
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          VO₂max
          <input
            type="number"
            value={vo2max}
            onChange={(e) => setVo2max(Number(e.target.value))}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Starting 10-day load (mi-eq)
          <input
            type="number"
            value={starting10DayLoad}
            onChange={(e) => setStarting10DayLoad(Number(e.target.value))}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Target peak 10-day load (mi-eq)
          <input
            type="number"
            value={targetPeak10DayLoad}
            onChange={(e) => setTargetPeak10DayLoad(Number(e.target.value))}
            style={{ width: "100%", padding: 8 }}
          />
        </label>
      </div>

      <button
        onClick={handleGenerate}
        style={{
          marginTop: 14,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #0ea5e9",
          cursor: "pointer",
          background: "linear-gradient(120deg, #0ea5e9, #22d3ee)",
          color: "#f8fafc",
          fontWeight: 700,
          boxShadow: "0 10px 30px rgba(14, 165, 233, 0.25)",
        }}
      >
        Generate plan to {RACE_DATE}
      </button>

      {!hasWorkdays && (
        <div style={{ marginTop: 14, color: "crimson" }}>
          No work calendar imported yet. Go to <code>/setup</code> first.
        </div>
      )}

      {error && (
        <div style={{ marginTop: 14, color: "crimson" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Table */}
      {plan && stats && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Training Plan</h2>
            <div style={{ fontSize: 13, color: "#475569" }}>
              Runs on workdays: <strong>{stats.runOnWorkdayCount}</strong>{" "}
              · Max run streak: <strong>{stats.maxRunStreak}</strong>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table
              style={{
                borderCollapse: "separate",
                borderSpacing: 0,
                width: "100%",
                fontSize: 14,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 14px 40px rgba(15, 23, 42, 0.08)",
                overflow: "hidden",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569", textTransform: "uppercase", letterSpacing: 0.4, fontSize: 12 }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 110 }}>Phase</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 150 }}>Date</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: 80 }}>Work</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 140 }}>Workout</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: 90 }}>Quality</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>Details</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", width: 110 }}>Total Miles</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", width: 130 }}>10-Day Load</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((d: PlanDay, idx: number) => {
                  const loadValue = stats.rolling10DayTotalEq[idx];
                  const loadPct = targetPeak10DayLoad
                    ? Math.min(1, Math.max(0, loadValue / targetPeak10DayLoad))
                    : 0;
                  const workoutMiles = (() => {
                    if (d.workoutType === "run") return d.runDistanceMi || sumSegmentMiles(d.segments || []);
                    if (d.workoutType === "peloton") return safeNumber(d.pelotonLoadEq);
                    if (d.workoutType === "strength") return 0;
                    return 0;
                  })();
                  const qualityLabel = d.workoutType === "rest" ? "—" : d.isQualityDay ? "Quality" : "Easy";

                  return (
                    <tr key={d.date ?? idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "12px", color: "#475569", verticalAlign: "top" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: "#eef2ff",
                            color: "#4338ca",
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                          }}
                        >
                          {d.phase}
                        </span>
                      </td>
                      <td style={{ padding: "12px", fontWeight: 800, color: "#0f172a", verticalAlign: "top" }}>
                        {formatFriendlyDate(d.date)}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center", verticalAlign: "top", fontSize: 16 }}>
                        {d.isWorkday ? "🧑‍💻" : "—"}
                      </td>
                      <td style={{ padding: "12px", verticalAlign: "top" }}>
                        <WorkoutPill day={d} />
                      </td>
                      <td style={{ padding: "12px", textAlign: "center", color: qualityLabel === "Quality" ? "#b45309" : "#475569", verticalAlign: "top", fontWeight: 700 }}>
                        {qualityLabel}
                      </td>
                      <td style={{ padding: "12px", lineHeight: 1.5, color: "#0f172a" }}>
                        <WorkoutDetails day={d} />
                      </td>
                      <td
                        style={{
                          padding: "12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "#0f172a",
                          verticalAlign: "top",
                          fontWeight: 700,
                        }}
                      >
                        {d.workoutType === "rest" ? "0" : workoutMiles.toFixed(1)}
                      </td>
                      <td
                        style={{
                          padding: "12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "#475569",
                          verticalAlign: "top",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          <div style={{ fontWeight: 700 }}>
                            {loadValue !== undefined ? loadValue.toFixed(1) : "—"}
                          </div>
                          <div
                            aria-hidden
                            style={{
                              width: 70,
                              height: 6,
                              background: "#e2e8f0",
                              borderRadius: 999,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${(loadPct * 100).toFixed(0)}%`,
                                height: "100%",
                                background: "linear-gradient(90deg, #0ea5e9, #22d3ee)",
                                transition: "width 0.3s ease",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Optional debug block (handy) */}
          <div style={{ marginTop: 16 }}>
            <details>
              <summary style={{ cursor: "pointer" }}>Workout counts</summary>
              <pre style={{ marginTop: 10, padding: 12, background: "#f8fafc", borderRadius: 6 }}>
                {JSON.stringify(stats.counts, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </main>
  );
}
