import { describe, it, expect } from "vitest";
import { buildStaffIcsCalendar, escapeIcsText, foldIcsLine, icsLocalDateTime, nextIcsDate, type IcsEvent } from "./ics";

describe("escapeIcsText", () => {
  it("escapes backslash, comma, semicolon, and newline per RFC 5545", () => {
    expect(escapeIcsText("A, B; C\\D\nE")).toBe("A\\, B\\; C\\\\D\\nE");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines untouched", () => {
    expect(foldIcsLine("SUMMARY:Short")).toBe("SUMMARY:Short");
  });

  it("folds a long line at 75 chars with a single leading space on continuations", () => {
    const long = "DESCRIPTION:" + "x".repeat(200);
    const folded = foldIcsLine(long);
    const parts = folded.split("\r\n");
    expect(parts[0].length).toBe(75);
    for (const cont of parts.slice(1)) {
      expect(cont.startsWith(" ")).toBe(true);
    }
    // Unfolding (strip CRLF + one leading space) must reconstruct the original.
    const unfolded = parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
    expect(unfolded).toBe(long);
  });
});

describe("icsLocalDateTime", () => {
  it("formats a normal time", () => {
    expect(icsLocalDateTime("2026-09-10", 8 * 60 + 30)).toBe("20260910T083000");
  });

  it("wraps a negative offset back into the same day (matches formatClock's own wrap behavior)", () => {
    expect(icsLocalDateTime("2026-09-10", -30)).toBe("20260910T233000");
  });
});

describe("nextIcsDate", () => {
  it("advances one calendar day", () => {
    expect(nextIcsDate("2026-09-30")).toBe("2026-10-01");
  });

  it("handles a year boundary", () => {
    expect(nextIcsDate("2026-12-31")).toBe("2027-01-01");
  });
});

describe("buildStaffIcsCalendar", () => {
  const now = new Date("2026-09-20T18:00:00Z");

  it("produces a valid-looking VCALENDAR wrapper with the timezone block", () => {
    const ics = buildStaffIcsCalendar("Julia — Sandbox Photographers", [], now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:America/Los_Angeles");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("writes a timed event with TZID (not a floating or UTC time)", () => {
    const events: IcsEvent[] = [
      {
        uid: "pd-1-staff-1@sandboxphotographers.com",
        date: "2026-09-10",
        startMinutes: 7 * 60,
        endMinutes: 14 * 60 + 30,
        summary: "Jefferson Elementary — Photographer",
        location: "123 Main St",
        description: "Role: Photographer",
      },
    ];
    const ics = buildStaffIcsCalendar("Test", events, now);
    expect(ics).toContain("DTSTART;TZID=America/Los_Angeles:20260910T070000");
    expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20260910T143000");
    expect(ics).toContain("SUMMARY:Jefferson Elementary — Photographer");
    expect(ics).toContain("LOCATION:123 Main St");
    expect(ics).toContain(`UID:${events[0].uid}`);
  });

  it("writes an all-day event (VALUE=DATE, exclusive next-day DTEND) when times are null — the honest TBD equivalent, never a guessed time", () => {
    const events: IcsEvent[] = [
      {
        uid: "pd-2-staff-1@sandboxphotographers.com",
        date: "2026-09-11",
        startMinutes: null,
        endMinutes: null,
        summary: "Some School — Assistant",
      },
    ];
    const ics = buildStaffIcsCalendar("Test", events, now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260911");
    expect(ics).toContain("DTEND;VALUE=DATE:20260912");
    expect(ics).not.toContain("TZID=America/Los_Angeles:2026091");
  });

  it("escapes a comma in an address used as LOCATION", () => {
    const events: IcsEvent[] = [
      {
        uid: "pd-3-staff-1@sandboxphotographers.com",
        date: "2026-09-12",
        startMinutes: null,
        endMinutes: null,
        summary: "School",
        location: "123 Main St, Martinez, CA 94553",
      },
    ];
    const ics = buildStaffIcsCalendar("Test", events, now);
    expect(ics).toContain("LOCATION:123 Main St\\, Martinez\\, CA 94553");
  });
});
