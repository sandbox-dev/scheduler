import { describe, it, expect } from "vitest";
import { buildCalendarEventsForStaff, type CalendarFeedDay } from "./calendarFeed";

const siteUrl = "https://scheduler.example.com";

function day(overrides: Partial<CalendarFeedDay> = {}): CalendarFeedDay {
  return {
    pictureDayId: "pd-1",
    date: "2026-09-10",
    roles: ["Photographer"],
    jobName: "Jefferson Job",
    schoolName: "Jefferson Elementary",
    schoolAddress: "123 Main St",
    timelineFields: null,
    ...overrides,
  };
}

describe("buildCalendarEventsForStaff", () => {
  it("prefers the school name over the job name for the title", () => {
    const [event] = buildCalendarEventsForStaff([day()], "staff-1", siteUrl);
    expect(event.summary).toBe("Jefferson Elementary — Photographer");
  });

  it("falls back to the job name when there's no linked school", () => {
    const [event] = buildCalendarEventsForStaff([day({ schoolName: null })], "staff-1", siteUrl);
    expect(event.summary).toBe("Jefferson Job — Photographer");
  });

  it("lists multiple roles in the app's fixed priority order, not DB row order", () => {
    const [event] = buildCalendarEventsForStaff([day({ roles: ["Assistant", "Photographer"] })], "staff-1", siteUrl);
    expect(event.summary).toBe("Jefferson Elementary — Photographer & Assistant");
  });

  it("is all-day (null start/end) with no timeline fields", () => {
    const [event] = buildCalendarEventsForStaff([day()], "staff-1", siteUrl);
    expect(event.startMinutes).toBeNull();
    expect(event.endMinutes).toBeNull();
  });

  it("computes real arrival/end minutes when timeline fields are available, matching /team's own Arrival/End", () => {
    const [event] = buildCalendarEventsForStaff(
      [
        day({
          timelineFields: {
            school_start_time: "08:00",
            end_time: "14:30",
            photo_start_offset_minutes: 15,
            group_start_offset_minutes: null,
          },
        }),
      ],
      "staff-1",
      siteUrl
    );
    // Arrival = min(photoStart, groupStart) - 60 = (8:00 + 15) - 60 = 7:15am = 435
    expect(event.startMinutes).toBe(7 * 60 + 15);
    // End = school's own end_time, unmodified
    expect(event.endMinutes).toBe(14 * 60 + 30);
  });

  it("includes a link back to /team and the role in the description", () => {
    const [event] = buildCalendarEventsForStaff([day()], "staff-1", siteUrl);
    expect(event.description).toContain(`${siteUrl}/team`);
    expect(event.description).toContain("Role: Photographer");
  });

  it("keeps the location empty (not the literal string) when there's no address", () => {
    const [event] = buildCalendarEventsForStaff([day({ schoolAddress: null })], "staff-1", siteUrl);
    expect(event.location).toBeUndefined();
  });

  it("builds a UID that's stable per (picture day, staff) and distinct across staff", () => {
    const [a] = buildCalendarEventsForStaff([day()], "staff-1", siteUrl);
    const [b] = buildCalendarEventsForStaff([day()], "staff-2", siteUrl);
    expect(a.uid).not.toBe(b.uid);
    expect(a.uid).toContain("pd-1");
    expect(a.uid).toContain("staff-1");
  });
});
