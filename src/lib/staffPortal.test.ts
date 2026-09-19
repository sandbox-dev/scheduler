import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  formatClock,
  photoStartMinutes,
  groupStartMinutes,
  arrivalMinutes,
  computeStaffPortalDayTimes,
  TBD_TIMES,
} from "./staffPortal";

describe("timeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(timeToMinutes("08:00")).toBe(480);
  });

  it("parses HH:MM:SS, ignoring seconds", () => {
    expect(timeToMinutes("08:00:00")).toBe(480);
  });

  it("handles noon and midnight", () => {
    expect(timeToMinutes("12:00")).toBe(720);
    expect(timeToMinutes("00:00")).toBe(0);
  });
});

describe("formatClock", () => {
  it("formats a plain morning time", () => {
    expect(formatClock(480)).toBe("8:00 AM");
  });

  it("formats noon as 12:00 PM, not 0:00 PM", () => {
    expect(formatClock(720)).toBe("12:00 PM");
  });

  it("formats midnight as 12:00 AM, not 0:00 AM", () => {
    expect(formatClock(0)).toBe("12:00 AM");
  });

  it("wraps a negative value back into the previous day", () => {
    // 7:30 AM computed as 8:00 AM - 30 min
    expect(formatClock(450)).toBe("7:30 AM");
  });

  it("wraps a value past midnight forward", () => {
    expect(formatClock(1440 + 30)).toBe("12:30 AM");
  });
});

describe("photoStartMinutes", () => {
  it("adds the offset to the school start time", () => {
    expect(photoStartMinutes({ school_start_time: "08:00", photo_start_offset_minutes: 30 })).toBe(510);
  });

  it("supports a zero offset", () => {
    expect(photoStartMinutes({ school_start_time: "08:00", photo_start_offset_minutes: 0 })).toBe(480);
  });
});

describe("groupStartMinutes", () => {
  const base = { school_start_time: "08:00", photo_start_offset_minutes: 30, end_time: "12:00" };

  it("matches the individual start when there's no group offset", () => {
    expect(groupStartMinutes({ ...base, group_start_offset_minutes: null })).toBe(510);
  });

  it("starts later when the group offset is positive", () => {
    expect(groupStartMinutes({ ...base, group_start_offset_minutes: 15 })).toBe(525);
  });

  it("starts earlier when the group offset is negative", () => {
    expect(groupStartMinutes({ ...base, group_start_offset_minutes: -20 })).toBe(490);
  });
});

describe("arrivalMinutes", () => {
  it("is 60 minutes before the individual start when group runs no earlier", () => {
    const fields = { school_start_time: "08:00", photo_start_offset_minutes: 30, group_start_offset_minutes: null, end_time: "12:00" };
    // photo start 8:30 -> arrival 7:30
    expect(arrivalMinutes(fields)).toBe(timeToMinutes("07:30"));
  });

  it("is 60 minutes before whichever track starts earliest", () => {
    const fields = { school_start_time: "08:00", photo_start_offset_minutes: 30, group_start_offset_minutes: -45, end_time: "12:00" };
    // individual start 8:30, group start 7:45 -> arrival 6:45
    expect(arrivalMinutes(fields)).toBe(timeToMinutes("06:45"));
  });
});

describe("computeStaffPortalDayTimes", () => {
  it("returns TBD for every field when there's no timeline yet", () => {
    expect(computeStaffPortalDayTimes(null)).toEqual(TBD_TIMES);
  });

  it("computes arrival/start/end from a real snapshot", () => {
    const fields = {
      school_start_time: "08:00",
      photo_start_offset_minutes: 30,
      group_start_offset_minutes: null,
      end_time: "12:00",
    };
    expect(computeStaffPortalDayTimes(fields)).toEqual({
      arrival: "7:30 AM",
      start: "8:30 AM",
      end: "12:00 PM",
    });
  });

  it("still shows end_time even when the group track starts earlier", () => {
    const fields = {
      school_start_time: "08:00",
      photo_start_offset_minutes: 30,
      group_start_offset_minutes: -45,
      end_time: "12:30",
    };
    expect(computeStaffPortalDayTimes(fields)).toEqual({
      arrival: "6:45 AM",
      start: "8:30 AM",
      end: "12:30 PM",
    });
  });
});
