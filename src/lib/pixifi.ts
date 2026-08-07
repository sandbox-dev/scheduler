// Pure ICS parsing + reconciliation logic for the Pixifi calendar-feed check
// (no I/O — the fetch itself lives in the server action that calls this).
// See AGENTS.md for the feature's background.

export type PixifiEvent = { date: string; summary: string };

// RFC 5545 line folding: a continuation line starts with a single space or
// tab and should be joined onto the previous line with that leading
// whitespace removed.
function unfoldIcsLines(icsText: string): string[] {
  const rawLines = icsText.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function icsDateValue(line: string): string | null {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const m = line.slice(idx + 1).match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function icsTextValue(line: string): string {
  const idx = line.indexOf(":");
  const raw = idx === -1 ? "" : line.slice(idx + 1);
  return raw.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

// Extracts one {date, summary} per VEVENT. Events with no parseable
// DTSTART are dropped — nothing to reconcile a date-less event against.
export function parseIcsEvents(icsText: string): PixifiEvent[] {
  const lines = unfoldIcsLines(icsText);
  const events: PixifiEvent[] = [];
  let inEvent = false;
  let date: string | null = null;
  let summary = "";

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      date = null;
      summary = "";
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (date) events.push({ date, summary });
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    if (line.startsWith("DTSTART")) date = icsDateValue(line);
    else if (line.startsWith("SUMMARY")) summary = icsTextValue(line);
  }

  return events;
}

// Strips punctuation/case and Pixifi's make-up-day suffix (same pattern as
// the webhook's saved-school lookup, src/app/api/webhooks/zapier/jobs/route.ts)
// so "Jefferson Elementary - Picture Day" and "Jefferson Elementary" line up.
function normalizeSchoolName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bmake[\s-]?up\s+day\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ReconciliationResult = {
  // In Scheduler with no matching Pixifi event that date — possibly
  // canceled in Pixifi.
  schedulerOnly: { date: string; school: string }[];
  // In Pixifi's feed with no matching Job/Picture Day — booked but missing
  // from Scheduler.
  pixifiOnly: { date: string; summary: string }[];
};

// Same-date + fuzzy (substring, either direction) name match. A short
// normalized name (<3 chars) never matches anything — guards against a
// blank/near-blank name matching every event that date.
export function reconcile(
  pixifiEvents: PixifiEvent[],
  schedulerDays: { date: string; school: string }[]
): ReconciliationResult {
  const matchedPixifi = new Set<number>();
  const matchedScheduler = new Set<number>();

  pixifiEvents.forEach((pe, pi) => {
    const normSummary = normalizeSchoolName(pe.summary);
    if (normSummary.length < 3) return;
    schedulerDays.forEach((sd, si) => {
      if (matchedScheduler.has(si) || sd.date !== pe.date) return;
      const normSchool = normalizeSchoolName(sd.school);
      if (normSchool.length < 3) return;
      if (normSummary.includes(normSchool) || normSchool.includes(normSummary)) {
        matchedPixifi.add(pi);
        matchedScheduler.add(si);
      }
    });
  });

  return {
    schedulerOnly: schedulerDays.filter((_, si) => !matchedScheduler.has(si)),
    pixifiOnly: pixifiEvents.filter((_, pi) => !matchedPixifi.has(pi)),
  };
}
