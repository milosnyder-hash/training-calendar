import ical from "node-ical";

/**
 * Fetches and parses an ICS calendar from a public URL.
 * Returns only actual calendar events (VEVENT).
 *
 * Adds helpful error messages + a fallback attempt that URL-encodes '@' as '%40'
 * (Google Calendar ICS URLs often require this).
 */
export async function parseICS(icsUrl: string) {
  async function fetchAndParse(url: string) {
    const data = await ical.async.fromURL(url);
    return Object.values(data).filter((item: any) => item.type === "VEVENT");
    // Each event typically has: start, end, summary, uid, etc.
  }

  try {
    return await fetchAndParse(icsUrl);
  } catch (e1: any) {
    // If the URL has an '@', try encoding it as '%40' (common Google Calendar requirement)
    if (icsUrl.includes("@") && !icsUrl.includes("%40")) {
      const encoded = icsUrl.replaceAll("@", "%40");
      try {
        return await fetchAndParse(encoded);
      } catch (e2: any) {
        throw new Error(
          [
            `Failed to fetch/parse ICS (original): ${icsUrl}`,
            `Error: ${e1?.message || String(e1)}`,
            ``,
            `Also tried (encoded): ${encoded}`,
            `Error: ${e2?.message || String(e2)}`,
          ].join("\n")
        );
      }
    }

    throw new Error(
      `Failed to fetch/parse ICS: ${icsUrl}\nError: ${e1?.message || String(e1)}`
    );
  }
}
