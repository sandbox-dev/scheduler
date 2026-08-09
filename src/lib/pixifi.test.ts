import { describe, it, expect } from "vitest";
import { parseIcsEvents, isSchoolPictureDayEvent, reconcile, type PixifiEvent } from "./pixifi";

function ics(...lines: string[]) {
  return lines.join("\r\n");
}

describe("parseIcsEvents", () => {
  it("extracts date, summary, and event type from a single VEVENT", () => {
    const events = parseIcsEvents(
      ics(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260910",
        "SUMMARY:Jefferson Elementary - Picture Day",
        "DESCRIPTION:Event Type: Picture Day",
        "END:VEVENT",
        "END:VCALENDAR"
      )
    );

    expect(events).toEqual([
      {
        date: "2026-09-10",
        summary: "Jefferson Elementary - Picture Day",
        description: "Event Type: Picture Day",
        eventType: "Picture Day",
        durationMinutes: null,
      },
    ]);
  });

  it("computes duration from DTSTART/DTEND on the same event", () => {
    const events = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "DTSTART:20260910T090000",
        "DTEND:20260910T093000",
        "SUMMARY:Cohen School Make Up",
        "DESCRIPTION:Event Type: Make-Up Picture Day",
        "END:VEVENT"
      )
    );
    expect(events[0].durationMinutes).toBe(30);
  });

  it("un-folds a continuation line per RFC 5545 before reading it", () => {
    const events = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260910",
        "DESCRIPTION:Event Type: Picture Day  more detail that wra",
        " ps onto a second physical line",
        "SUMMARY:Test",
        "END:VEVENT"
      )
    );
    expect(events[0].description).toContain("wraps onto a second physical line");
  });

  it("drops an event with no parseable DTSTART", () => {
    const events = parseIcsEvents(ics("BEGIN:VEVENT", "SUMMARY:No date here", "END:VEVENT"));
    expect(events).toEqual([]);
  });
});

describe("isSchoolPictureDayEvent", () => {
  const base: PixifiEvent = {
    date: "2026-09-10",
    summary: "Test",
    description: "",
    eventType: null,
    durationMinutes: null,
  };

  it("defaults to shown when there's no eventType at all", () => {
    expect(isSchoolPictureDayEvent(base)).toBe(true);
  });

  it("filters out known non-school event types (case-insensitively)", () => {
    expect(isSchoolPictureDayEvent({ ...base, eventType: "Senior Portrait" })).toBe(false);
    expect(isSchoolPictureDayEvent({ ...base, eventType: "senior portrait" })).toBe(false);
  });

  it("keeps a real whole-school makeup day (long duration)", () => {
    expect(isSchoolPictureDayEvent({ ...base, eventType: "Make-Up Picture Day", durationMinutes: 105 })).toBe(true);
  });

  it("filters out a brief individual retake slot bundled under the same event type", () => {
    expect(isSchoolPictureDayEvent({ ...base, eventType: "Make-Up Picture Day", durationMinutes: 5 })).toBe(false);
  });

  it("keeps a make-up event with unknown duration rather than silently hiding it", () => {
    expect(isSchoolPictureDayEvent({ ...base, eventType: "Make-Up Picture Day", durationMinutes: null })).toBe(true);
  });

  it("keeps an event type it's never seen before, rather than guessing it's not a school job", () => {
    expect(isSchoolPictureDayEvent({ ...base, eventType: "Some New Pixifi Type" })).toBe(true);
  });
});

describe("reconcile", () => {
  it("matches same-date events by direct substring, in either direction", () => {
    const result = reconcile(
      [{ date: "2026-09-10", summary: "Jefferson Elementary - Picture Day", description: "", eventType: null, durationMinutes: null }],
      [{ date: "2026-09-10", school: "Jefferson Elementary" }]
    );
    expect(result.pixifiOnly).toEqual([]);
    expect(result.schedulerOnly).toEqual([]);
  });

  it("matches via shared distinctive words, ignoring a school-type suffix vs a city name in the same slot", () => {
    const result = reconcile(
      [{ date: "2026-09-10", summary: "St. Agnes Concord", description: "", eventType: null, durationMinutes: null }],
      [{ date: "2026-09-10", school: "St. Agnes School" }]
    );
    expect(result.pixifiOnly).toEqual([]);
    expect(result.schedulerOnly).toEqual([]);
  });

  it("tolerates a real one-character-edit typo between the two sides", () => {
    const result = reconcile(
      [{ date: "2026-09-10", summary: "Trinity Day School", description: "", eventType: null, durationMinutes: null }],
      [{ date: "2026-09-10", school: "Trinty Day School" }]
    );
    expect(result.pixifiOnly).toEqual([]);
    expect(result.schedulerOnly).toEqual([]);
  });

  it("matches Scheduler's acronym client name against Pixifi's spelled-out title", () => {
    const result = reconcile(
      [{ date: "2026-09-10", summary: "Contra Costa Jewish Day School", description: "", eventType: null, durationMinutes: null }],
      [{ date: "2026-09-10", school: "CCJDS" }]
    );
    expect(result.pixifiOnly).toEqual([]);
    expect(result.schedulerOnly).toEqual([]);
  });

  it("matches two same-shape abbreviations that are a typo of each other", () => {
    const result = reconcile(
      [{ date: "2026-09-10", summary: "DMVS Fall Pictures", description: "", eventType: null, durationMinutes: null }],
      [{ date: "2026-09-10", school: "DVMS" }]
    );
    expect(result.pixifiOnly).toEqual([]);
    expect(result.schedulerOnly).toEqual([]);
  });

  it("reports genuinely unmatched events on both sides, and never double-matches one event", () => {
    const result = reconcile(
      [{ date: "2026-09-10", summary: "Totally Unrelated Studio Shoot", description: "", eventType: null, durationMinutes: null }],
      [{ date: "2026-09-10", school: "Jefferson Elementary" }]
    );
    expect(result.pixifiOnly).toEqual([
      { date: "2026-09-10", summary: "Totally Unrelated Studio Shoot", description: "", eventType: null, durationMinutes: null },
    ]);
    expect(result.schedulerOnly).toEqual([{ date: "2026-09-10", school: "Jefferson Elementary" }]);
  });

  it("never matches events on different dates even with identical names", () => {
    const result = reconcile(
      [{ date: "2026-09-11", summary: "Jefferson Elementary", description: "", eventType: null, durationMinutes: null }],
      [{ date: "2026-09-10", school: "Jefferson Elementary" }]
    );
    expect(result.pixifiOnly).toHaveLength(1);
    expect(result.schedulerOnly).toHaveLength(1);
  });

  it("a Scheduler-only day with zero Pixifi events that month reports every Pixifi event as pixifiOnly", () => {
    const result = reconcile(
      [{ date: "2026-09-10", summary: "New School", description: "", eventType: null, durationMinutes: null }],
      []
    );
    expect(result.pixifiOnly).toHaveLength(1);
    expect(result.schedulerOnly).toEqual([]);
  });
});
