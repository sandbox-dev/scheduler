// Pure ICS parsing + reconciliation logic for the Pixifi calendar-feed check
// (no I/O — the fetch itself lives in the server action that calls this).
// See AGENTS.md for the feature's background.

export type PixifiEvent = {
  date: string;
  summary: string;
  eventType: string | null;
  description: string;
  durationMinutes: number | null;
};

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

// Full date+time (falls back to midnight for an all-day VALUE=DATE event) —
// used only to measure a single event's own duration, so the naive/local
// parse is fine even with no timezone offset applied: DTSTART and DTEND on
// the same event share whatever offset Pixifi wrote, and it cancels out.
function icsDateTimeValue(line: string): Date | null {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const m = line.slice(idx + 1).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
}

function icsTextValue(line: string): string {
  const idx = line.indexOf(":");
  const raw = idx === -1 ? "" : line.slice(idx + 1);
  return raw.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

// Extracts one {date, summary, eventType, description} per VEVENT. Events
// with no parseable DTSTART are dropped — nothing to reconcile a date-less
// event against. `eventType` comes from Pixifi's own "Event Type: X" tag
// embedded in DESCRIPTION (e.g. "Picture Day", "Senior Portrait") — a
// structured signal from Pixifi itself, not guessed from the title text.
export function parseIcsEvents(icsText: string): PixifiEvent[] {
  const lines = unfoldIcsLines(icsText);
  const events: PixifiEvent[] = [];
  let inEvent = false;
  let date: string | null = null;
  let summary = "";
  let description = "";
  let dtStart: Date | null = null;
  let dtEnd: Date | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      date = null;
      summary = "";
      description = "";
      dtStart = null;
      dtEnd = null;
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (date) {
        const eventTypeMatch = description.match(/Event Type:\s*(.+?)(?:\s{2,}|$)/);
        const durationMinutes =
          dtStart && dtEnd ? Math.round((dtEnd.getTime() - dtStart.getTime()) / 60000) : null;
        events.push({
          date,
          summary,
          description,
          eventType: eventTypeMatch ? eventTypeMatch[1].trim() : null,
          durationMinutes,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    if (line.startsWith("DTSTART")) {
      date = icsDateValue(line);
      dtStart = icsDateTimeValue(line);
    } else if (line.startsWith("DTEND")) {
      dtEnd = icsDateTimeValue(line);
    } else if (line.startsWith("SUMMARY")) {
      summary = icsTextValue(line);
    } else if (line.startsWith("DESCRIPTION")) {
      description = icsTextValue(line);
    }
  }

  return events;
}

// Pixifi event types that are never a school-site crew job — individual or
// corporate portrait sessions and sales meetings, several of which happen
// at Sandbox's own studio (see STUDIO_ADDRESS, src/lib/types.ts) rather
// than a school. A brand-new Pixifi event type not in this list defaults
// to *shown* rather than silently hidden.
const NON_SCHOOL_EVENT_TYPES = new Set([
  "new client meeting", "senior portrait", "mini session", "family session",
  "employee pro portrait", "pro portrait", "professional portrait", "school site visit",
]);

// "Make-Up Picture Day" is Pixifi's event type for both a real whole-school
// makeup day (an actual gap worth flagging) and a single family's brief
// retake slot (several bundled onto one shared "retake day," titled like
// "Cohen School Make Up") — split by duration, which turns out to be a
// clean, non-overlapping signal in real data: every individual retake slot
// sampled is exactly 5 minutes, every real whole-school makeup day is 105+
// minutes. (Location isn't reliable for this — some individual retakes
// happen back at the school's own site, not Sandbox's studio.) A missing
// duration (no DTEND) defaults to *shown* rather than silently hidden.
const INDIVIDUAL_RETAKE_MAX_MINUTES = 30;

export function isSchoolPictureDayEvent(event: PixifiEvent): boolean {
  if (!event.eventType) return true;
  const type = event.eventType.toLowerCase();
  if (NON_SCHOOL_EVENT_TYPES.has(type)) return false;
  if (
    type === "make-up picture day" &&
    event.durationMinutes !== null &&
    event.durationMinutes <= INDIVIDUAL_RETAKE_MAX_MINUTES
  ) {
    return false;
  }
  return true;
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

// Generic filler words that show up on one side but not the other (a
// school-type suffix on Scheduler's side, e.g. "St. Agnes School", vs a
// city name in the same slot on Pixifi's side, e.g. "St. Agnes Concord") —
// excluded when comparing which *distinctive* words the two names share,
// but kept when spelling out an acronym's initials (see acronymMatches),
// since e.g. "Center" contributes the real "C" in "CLC".
const FILLER_WORDS = new Set([
  "school", "elementary", "academy", "middle", "high", "community", "center", "centre",
  "campus", "preschool", "christian", "adventist", "valley", "the", "of", "saint", "st",
  "es", "ms", "hs", "tk", "pc", "day",
]);

function significantWords(s: string): string[] {
  return normalizeSchoolName(s)
    .split(" ")
    .filter((w) => w && !FILLER_WORDS.has(w) && !/^\d+$/.test(w));
}

// Damerau-Levenshtein (includes adjacent-transposition as a single edit) —
// real Pixifi data has at least one client-name typo that's exactly this
// shape ("DVMS" in Scheduler vs "DMVS" in Pixifi's own event title).
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Whole-string acronym, e.g. Scheduler's job client field is literally
// "CCJDS" or "DVMS" with no spelled-out name anywhere in this app.
function isAcronymLike(raw: string): boolean {
  return /^[A-Z]{2,8}$/.test(raw.replace(/[^A-Za-z]/g, ""));
}

// Checks whether `acronym` could be the initials of `otherName`'s words —
// tried both with and without the last word, since Pixifi's title usually
// appends the city after the school's own name/acronym.
function acronymMatches(acronym: string, otherName: string): boolean {
  const words = normalizeSchoolName(otherName)
    .split(" ")
    .filter((w) => w && !/^\d+$/.test(w));
  if (words.length === 0) return false;
  const initialsFull = words.map((w) => w[0]).join("");
  const initialsMinusLast = words.length > 1 ? words.slice(0, -1).map((w) => w[0]).join("") : initialsFull;
  const a = acronym.toLowerCase();
  return editDistance(a, initialsFull) <= 1 || editDistance(a, initialsMinusLast) <= 1;
}

// Handles the case where Pixifi's own title already uses a short
// abbreviation itself (not spelled out) that's a near-typo of Scheduler's,
// e.g. "DVMS" vs a title containing the standalone word "DMVS".
function acronymMatchesAnyWord(acronym: string, otherName: string): boolean {
  const a = acronym.toLowerCase();
  return normalizeSchoolName(otherName)
    .split(" ")
    .some((w) => w.length >= 3 && editDistance(a, w) <= 1);
}

// Same-date fuzzy name match between a Job's school name and a Pixifi
// event's title. Tries, in order: direct substring (either direction),
// shared-distinctive-word overlap (handles a school-type suffix on one
// side vs a city name in the same slot on the other), then an acronym
// check in both directions (handles Scheduler's abbreviated client names,
// e.g. "CCJDS" for "Contra Costa Jewish Day School").
function namesMatch(schedulerName: string, pixifiSummary: string): boolean {
  const normA = normalizeSchoolName(schedulerName);
  const normB = normalizeSchoolName(pixifiSummary);
  if (normA.length < 3 || normB.length < 3) return false;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const sigA = significantWords(schedulerName);
  const sigB = significantWords(pixifiSummary);
  if (sigA.length > 0 && sigB.length > 0) {
    const [small, big] = sigA.length <= sigB.length ? [sigA, sigB] : [sigB, sigA];
    // Exact-or-1-typo per word — real data has a genuine typo in one of
    // Scheduler's own saved names ("Trinty" for "Trinity") that would
    // otherwise never line up. Only applied to longer words (>=4 chars) so
    // this doesn't start pairing short, generic words that just happen to
    // be one edit apart.
    const overlap = small.filter((w) => big.some((bw) => w === bw || (w.length >= 4 && bw.length >= 4 && editDistance(w, bw) <= 1))).length;
    if (overlap / small.length >= 0.5) return true;
  }

  for (const [maybeAcronym, other] of [
    [schedulerName, pixifiSummary],
    [pixifiSummary, schedulerName],
  ]) {
    const compact = maybeAcronym.replace(/[^A-Za-z]/g, "");
    if (isAcronymLike(compact) && (acronymMatches(compact, other) || acronymMatchesAnyWord(compact, other))) {
      return true;
    }
  }

  return false;
}

export type ReconciliationResult = {
  // In Scheduler with no matching Pixifi event that date — possibly
  // canceled in Pixifi.
  schedulerOnly: { date: string; school: string }[];
  // In Pixifi's feed with no matching Job/Picture Day — booked but missing
  // from Scheduler.
  pixifiOnly: { date: string; summary: string }[];
};

export function reconcile(
  pixifiEvents: PixifiEvent[],
  schedulerDays: { date: string; school: string }[]
): ReconciliationResult {
  const matchedPixifi = new Set<number>();
  const matchedScheduler = new Set<number>();

  pixifiEvents.forEach((pe, pi) => {
    schedulerDays.forEach((sd, si) => {
      if (matchedScheduler.has(si) || sd.date !== pe.date) return;
      if (namesMatch(sd.school, pe.summary)) {
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
