import { NextResponse } from "next/server";
import { parseICS } from "@/lib/calendar/parseICS";
import { buildWorkdayMap } from "@/lib/calendar/buildWorkdayMap";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const icsUrl = body?.icsUrl;

    if (!icsUrl) {
      return NextResponse.json({ error: "Missing ICS URL" }, { status: 400 });
    }

    const events = await parseICS(icsUrl);
    const workdayMap = buildWorkdayMap(events);
    const dates = Object.keys(workdayMap).sort();

    return NextResponse.json({
      workdayCount: dates.length,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      map: workdayMap,
    });
  } catch (err: any) {
    // Log the real error to the server console
    console.error("Ingest error:", err);

    // Return JSON to the client so we can see the message
    return NextResponse.json(
      { error: err?.message || String(err) || "Internal Server Error" },
      { status: 500 }
    );
  }
}
