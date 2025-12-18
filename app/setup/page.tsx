"use client";

import { useEffect, useState } from "react";

export default function SetupPage() {
  const [icsUrl, setIcsUrl] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional: show whether localStorage already has a map
  const [hasSavedMap, setHasSavedMap] = useState(false);

  useEffect(() => {
    setHasSavedMap(Boolean(localStorage.getItem("workdayMap")));
  }, []);

  async function handleImport() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/work-calendar/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icsUrl }),
      });

      // Read as text first (so we can display helpful errors if it isn't JSON)
      const text = await res.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned non-JSON:\n${text.slice(0, 200)}...`);
      }

      if (!res.ok) {
        throw new Error(data?.error || "Import failed");
      }

      // ✅ Persist so /plan can use it
      localStorage.setItem("workdayMap", JSON.stringify(data.map));
      localStorage.setItem(
        "workdayCoverage",
        JSON.stringify({
          startDate: data.startDate,
          endDate: data.endDate,
          workdayCount: data.workdayCount,
        })
      );

      setHasSavedMap(true);
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    localStorage.removeItem("workdayMap");
    localStorage.removeItem("workdayCoverage");
    setHasSavedMap(false);
    setResult(null);
    setError(null);
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Import Work Calendar</h1>

      <p style={{ marginTop: 8 }}>
        Paste a public/secret <code>.ics</code> URL. We’ll convert it into a
        workday map so the training plan never schedules runs on shift days.
      </p>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 600 }}>ICS URL</label>

        <input
          style={{
            width: "100%",
            padding: 10,
            marginTop: 8,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          value={icsUrl}
          onChange={(e) => setIcsUrl(e.target.value)}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            onClick={handleImport}
            disabled={loading || !icsUrl.trim()}
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              border: "1px solid #333",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Importing..." : "Import"}
          </button>

          <button
            onClick={handleClear}
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              border: "1px solid #999",
              cursor: "pointer",
            }}
          >
            Clear saved map
          </button>
        </div>

        <div style={{ marginTop: 10, color: hasSavedMap ? "green" : "#555" }}>
          {hasSavedMap
            ? "✅ Workday map saved in this browser."
            : "No saved workday map yet."}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 16, color: "crimson" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Import Result</h2>
          <p style={{ marginTop: 6 }}>
            <strong>Workdays:</strong> {result.workdayCount}
            <br />
            <strong>Coverage:</strong> {result.startDate} → {result.endDate}
          </p>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Show full workday map</summary>
            <pre
              style={{
                marginTop: 10,
                padding: 12,
                background: "#f6f6f6",
                borderRadius: 6,
                overflowX: "auto",
              }}
            >
              {JSON.stringify(result.map, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </main>
  );
}
