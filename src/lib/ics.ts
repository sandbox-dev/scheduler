// Minimal hand-rolled ICS (RFC 5545) *writer* for a staff member's
// subscribable calendar feed (src/app/api/calendar/[token]/route.ts).
//
// Mirrors the house preference already set by parseIcsEvents() in
// src/lib/pixifi.ts — a hand-rolled *reader* built for the "Check Pixifi"
// reconciliation feature (see AGENTS.md §20): "Pixifi's feed only ever
// needs these few fields, not full RFC 5545 fidelity." Same reasoning
// applies in reverse here — this feed only ever writes plain one-off
// Picture Day events (no recurrence, no attendees, no alarms), so a small
// dependency-free writer covering just that subset stays simpler than
// pulling in the `ics` npm package for its full surface.
//
// The one piece of real RFC 5545 machinery this DOES need that the reader
// didn't: a VTIMEZONE block. The studio and every staff member are in the
// Bay Area — a timed event needs a real TZID, not a "floating" local time
// with no zone at all (a subscriber whose device/region is set to a
// different timezone would otherwise see the wrong hour). LOS_ANGELES_VTIMEZONE
// below is the standard, unchanging America/Los_Angeles definition (2nd
// Sunday in March to 1st Sunday in November DST, unchanged since 2007) —
// copied as fixed boilerplate text, not computed, so there's no fresh
// DST-rule arithmetic of our own to get wrong.

export type IcsEvent = {
  uid: string;
  date: string; // YYYY-MM-DD, the Picture Day's own date
  // Local time-of-day in minutes-from-midnight, Bay Area time. Both null
  // means an all-day event — this app's own honest "TBD" reflected as an
  // all-day event rather than a guessed time, the same treatment Pixifi's
  // own calendar already uses for a job with no confirmed time.
  startMinutes: number | null;
  endMinutes: number | null;
  summary: string;
  description?: string;
  location?: string;
};

const TZID = "America/Los_Angeles";

const LOS_ANGELES_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

// RFC 5545 §3.3.11: backslash, comma, and semicolon are escaped with a
// backslash; a real newline becomes the two-character sequence "\n".
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// RFC 5545 §3.1: a content line longer than 75 octets must be "folded" —
// split with a CRLF followed by a single leading space, which a reader
// strips back out. Splitting on character count rather than true UTF-8
// octet count is a deliberate simplification: every field this feed writes
// is short, studio-authored plain text (a school name, an address, a role
// name) — nowhere near long enough for that distinction to matter in
// practice.
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  let result = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    result += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return result;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

// A YYYY-MM-DD date plus minutes-from-midnight (wrapped into 0–1439 the
// same way src/lib/staffPortal.ts's formatClock() wraps a negative/
// overflowing offset) rendered as a local YYYYMMDDTHHMMSS value — always
// paired with TZID=America/Los_Angeles on the DTSTART/DTEND line itself,
// never a bare "Z" UTC suffix, since this is a wall-clock time in that one
// zone, not a UTC instant.
export function icsLocalDateTime(date: string, minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = Math.round(wrapped % 60);
  return `${date.replace(/-/g, "")}T${pad(hh)}${pad(mm)}00`;
}

function icsDateOnly(date: string): string {
  return date.replace(/-/g, "");
}

// DTEND on an all-day (VALUE=DATE) event is EXCLUSIVE per RFC 5545 — a
// one-day all-day event's DTEND is the next calendar date, not the same
// date repeated (a common hand-rolled-ICS mistake that otherwise renders as
// a zero-length or two-day event depending on the calendar app).
export function nextIcsDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildVevent(event: IcsEvent, dtstampUtc: string): string {
  const lines: string[] = ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${dtstampUtc}`];

  if (event.startMinutes === null || event.endMinutes === null) {
    lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDateOnly(nextIcsDate(event.date))}`);
  } else {
    lines.push(`DTSTART;TZID=${TZID}:${icsLocalDateTime(event.date, event.startMinutes)}`);
    lines.push(`DTEND;TZID=${TZID}:${icsLocalDateTime(event.date, event.endMinutes)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  return lines.map(foldIcsLine).join("\r\n");
}

// Builds a complete VCALENDAR document for one staff member's feed. `now`
// is injectable for tests; defaults to the real current time.
export function buildStaffIcsCalendar(calendarName: string, events: IcsEvent[], now: Date = new Date()): string {
  const dtstampUtc = `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sandbox Photographers//Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(calendarName)}`),
    `X-WR-TIMEZONE:${TZID}`,
    // Hints how often a subscribed client should re-poll — not honored by
    // every calendar app, but harmless where it isn't, and "always current"
    // is this whole feature's point, so a shorter hint than most feeds use
    // is worth it.
    "X-PUBLISHED-TTL:PT1H",
    LOS_ANGELES_VTIMEZONE,
    ...events.map((e) => buildVevent(e, dtstampUtc)),
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}
