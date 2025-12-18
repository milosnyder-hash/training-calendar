"use client";

import { useEffect, useState } from "react";
import { generatePlan } from "@/lib/training/generatePlan";
import { validatePlan } from "@/lib/training/validatePlan";

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
  run: "#d1fae5",
  peloton: "#bae6fd",
  strength: "#e9d5ff",
  rest: "#e5e7eb",
};

const WORKOUT_LABELS: Record<string, string> = {
  run: "Run",
  peloton: "Peloton",
  strength: "Strength",
  rest: "Rest",
};

function WorkoutPill({ type }: { type: string }) {
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: WORKOUT_COLORS[type] ?? "#eee",
        whiteSpace: "nowrap",
      }}
    >
      {WORKOUT_LABELS[type] ?? type}
    </span>
  );
}
function WorkoutDetails({ day }: { day: any }) {
  const segments = Array.isArray(day.segments) ? day.segments : [];
  const totalRunMiles = Number.isFinite(day.runDistanceMi) ? day.runDistanceMi : 0;
  const pelotonEq = Number.isFinite(day.pelotonLoadEq) ? day.pelotonLoadEq : 0;

  if (segments.length === 0 && pelotonEq === 0) return null;

  return (
    <div>
      {/* Run total */}
      {day.workoutType === "run" && totalRunMiles > 0 && (
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Total: {totalRunMiles.toFixed(1)} mi
        </div>
      )}

      {/* Peloton load */}
      {day.workoutType === "peloton" && pelotonEq > 0 && (
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          Load: {pelotonEq.toFixed(1)} mi-eq
        </div>
      )}

      {/* Segment breakdown */}
      {segments.length > 0 && (
        <ul style={{ paddingLeft: 16, margin: 0 }}>
          {segments.map((s: any, idx: number) => (
            <li key={idx} style={{ lineHeight: 1.4 }}>
              {s.label}
              {Number.isFinite(s.distanceMi) && ` — ${s.distanceMi} mi`}
              {s.durationMin && ` — ${s.durationMin} min`}
              {s.pace && ` @ ${s.pace}`}
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const [plan, setPlan] = useState<any[] | null>(null);
  const [validation, setValidation] = useState<any | null>(null);
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
      setValidation(validatePlan(generatedPlan, starting10DayLoad));

    } catch (e: any) {
      setError(e.message || "Unknown error");
    }
  }

  const phaseRanges = validation?.phaseRanges ?? null;

  return (
    <main style={{ padding: 24, maxWidth: 1400 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Training Plan Generator</h1>

      <p style={{ marginTop: 8 }}>
        Race day: <strong>{RACE_DATE}</strong> (8-mile event)
        <br />
        <strong>Runs are never scheduled on workdays.</strong>
        <br />
        Peloton contributes <em>miles-equivalent</em> load so total stress is realistic.
      </p>

      {/* Overview */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Plan Overview</div>
        <div style={{ lineHeight: 1.6 }}>
          <div>
            <strong>Starting 10-day load:</strong> {starting10DayLoad} mi-eq
            {"  "}·{"  "}
            <strong>Target peak 10-day load:</strong> {targetPeak10DayLoad} mi-eq
          </div>
          <div>
            <strong>Rules:</strong> No run on workdays · Strength ~1×/week on workdays · Rest 1–2×/week
          </div>
          {phaseRanges && (
            <div style={{ marginTop: 6 }}>
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
          borderRadius: 6,
          border: "1px solid #333",
          cursor: "pointer",
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
      {plan && validation && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Training Plan</h2>
            <div style={{ fontSize: 13, color: "#374151" }}>
              Runs on workdays: <strong>{validation.runOnWorkdayCount}</strong>{" "}
              · Max run streak: <strong>{validation.maxRunStreak}</strong>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                fontSize: 14,
              }}
            >
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Date</th>
                  <th style={{ padding: 8 }}>Work?</th>
                  <th style={{ padding: 8 }}>Phase</th>
                  <th style={{ padding: 8 }}>Workout</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Details</th>
                  <th style={{ padding: 8, textAlign: "right" }}>10-Day Total (mi-eq)</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((d: any, idx: number) => (
                  <tr key={d.date} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{d.date}</td>
                    <td style={{ padding: 8 }}>{d.isWorkday ? "Yes" : ""}</td>
                    <td style={{ padding: 8 }}>{d.phase}</td>
                    <td style={{ padding: 8 }}>
                      <WorkoutPill type={d.workoutType} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <WorkoutDetails day={d} />
                    </td>
                    <td
                      style={{
                        padding: 8,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {validation?.rolling10DayTotalEq?.[idx] !== undefined
                        ? validation.rolling10DayTotalEq[idx].toFixed(1)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Optional debug block (handy) */}
          <div style={{ marginTop: 16 }}>
            <details>
              <summary style={{ cursor: "pointer" }}>Workout counts</summary>
              <pre style={{ marginTop: 10, padding: 12, background: "#f6f6f6", borderRadius: 6 }}>
                {JSON.stringify(validation.counts, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </main>
  );
}
