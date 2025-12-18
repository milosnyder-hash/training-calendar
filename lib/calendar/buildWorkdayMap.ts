import { eachDayOfInterval } from "date-fns";

/**
 * Converts calendar events into a map of workdays.
 * Any day touched by an event is considered a workday.
 */
export function buildWorkdayMap(events: any[]) {
  const map: Record<string, boolean> = {};

  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);

    // Subtract 1ms so overnight shifts don’t spill into the next extra day
    const days = eachDayOfInterval({
      start,
      end: new Date(end.getTime() - 1),
    });

    for (const day of days) {
      const key = day.toISOString().slice(0, 10); // YYYY-MM-DD
      map[key] = true;
    }
  }

  return map;
}