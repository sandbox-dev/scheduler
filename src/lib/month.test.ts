import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { monthLabel, shiftMonth, addDays, getMonthsWithDates, pickDefaultMonth, selectableMonths, mondayOf, shiftWeek, getWeekGrid, getMonthGrid, computeJobLanes, todayPacific } from "./month";

describe("shiftMonth", () => {
  it("moves forward across a year boundary", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("moves backward across a year boundary", () => {
    expect(shiftMonth("2027-01-01", -1)).toBe("2026-12-01");
  });
});

describe("addDays", () => {
  it("rolls over into the next month", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("supports negative deltas", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("getMonthsWithDates", () => {
  it("dedupes dates down to their first-of-month, sorted", () => {
    expect(getMonthsWithDates(["2026-09-15", "2026-09-02", "2026-07-01"])).toEqual([
      "2026-07-01",
      "2026-09-01",
    ]);
  });
});

describe("date-dependent helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("pickDefaultMonth", () => {
    it("picks the soonest upcoming month with dates", () => {
      expect(pickDefaultMonth(["2026-07-01", "2026-09-01", "2026-12-01"])).toBe("2026-09-01");
    });

    it("falls back to the most recent past month when nothing is upcoming", () => {
      expect(pickDefaultMonth(["2026-05-01", "2026-06-01"])).toBe("2026-06-01");
    });

    it("falls back to the current calendar month when there's no data at all", () => {
      expect(pickDefaultMonth([])).toBe("2026-08-01");
    });
  });

  describe("selectableMonths", () => {
    it("always includes the current month and two months back", () => {
      const months = selectableMonths([]);
      expect(months).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
    });

    it("adds every future month that already has bookings, but not past ones beyond the 2-month window", () => {
      const months = selectableMonths(["2026-01-01", "2026-12-01", "2027-03-01"]);
      expect(months).toEqual(["2026-06-01", "2026-07-01", "2026-08-01", "2026-12-01", "2027-03-01"]);
    });
  });
});

describe("mondayOf", () => {
  it("returns the same date when it's already a Monday", () => {
    expect(mondayOf("2026-08-10")).toBe("2026-08-10");
  });

  it("rolls a Sunday back to the preceding Monday", () => {
    expect(mondayOf("2026-08-16")).toBe("2026-08-10");
  });

  it("rolls a mid-week date back to that week's Monday", () => {
    expect(mondayOf("2026-08-13")).toBe("2026-08-10");
  });
});

describe("shiftWeek", () => {
  it("moves forward by whole weeks", () => {
    expect(shiftWeek("2026-08-10", 2)).toBe("2026-08-24");
  });
});

describe("getWeekGrid", () => {
  it("returns 7 consecutive days flagging which ones belong to the given month", () => {
    const week = getWeekGrid("2026-08-31", "2026-08-01");
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ date: "2026-08-31", inMonth: true });
    expect(week[1]).toEqual({ date: "2026-09-01", inMonth: false });
  });
});

describe("getMonthGrid", () => {
  it("produces only full weeks that together cover the whole month", () => {
    const weeks = getMonthGrid("2026-08-01");
    weeks.forEach((w) => expect(w).toHaveLength(7));

    const allDates = weeks.flat();
    const inMonthDates = allDates.filter((d) => d.inMonth).map((d) => d.date);
    expect(inMonthDates).toHaveLength(31); // August has 31 days
    expect(inMonthDates[0]).toBe("2026-08-01");
    expect(inMonthDates[inMonthDates.length - 1]).toBe("2026-08-31");
  });

  it("pads a month that doesn't start on Monday with the tail of the previous month", () => {
    // 2026-08-01 is a Saturday, so the first week needs Mon-Fri padding from July.
    const weeks = getMonthGrid("2026-08-01");
    const leading = weeks[0].filter((d) => !d.inMonth);
    expect(leading.every((d) => d.date.startsWith("2026-07"))).toBe(true);
  });
});

describe("computeJobLanes", () => {
  it("keeps a job in the same lane across days it spans", () => {
    const week = getWeekGrid("2026-08-10", "2026-08-01");
    const jobIdsByDate = new Map([
      ["2026-08-10", ["jobA"]],
      ["2026-08-11", ["jobA"]],
    ]);
    const lanes = computeJobLanes(week, jobIdsByDate);
    expect(lanes.get("jobA")).toBe(0);
  });

  it("gives two jobs on the same day distinct lanes", () => {
    const week = getWeekGrid("2026-08-10", "2026-08-01");
    const jobIdsByDate = new Map([["2026-08-10", ["jobA", "jobB"]]]);
    const lanes = computeJobLanes(week, jobIdsByDate);
    expect(lanes.get("jobA")).not.toBe(lanes.get("jobB"));
  });

  it("lets a new job take the lowest lane not already used that day", () => {
    const week = getWeekGrid("2026-08-10", "2026-08-01");
    const jobIdsByDate = new Map([
      ["2026-08-10", ["jobA", "jobB"]],
      ["2026-08-11", ["jobB", "jobC"]], // jobA (lane 0) freed up on the 11th
    ]);
    const lanes = computeJobLanes(week, jobIdsByDate);
    expect(lanes.get("jobC")).toBe(0);
  });
});

describe("monthLabel", () => {
  it("formats a YYYY-MM-01 string as a human month/year", () => {
    expect(monthLabel("2026-09-01")).toMatch(/September/);
    expect(monthLabel("2026-09-01")).toMatch(/2026/);
  });
});

describe("team app week (Monday–Sunday, California date)", () => {
  it("snaps any day to its Monday — including Sunday, which belongs to the week before", () => {
    expect(mondayOf("2026-09-24")).toBe("2026-09-21"); // Thursday
    expect(mondayOf("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(mondayOf("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(addDays(mondayOf("2026-09-24"), 6)).toBe("2026-09-27");
  });

  it("todayPacific is still Sunday on a Sunday evening in California, when UTC is already Monday", () => {
    // Sun Sep 27 2026, 8pm PDT = Mon Sep 28, 03:00 UTC
    expect(todayPacific(new Date("2026-09-28T03:00:00Z"))).toBe("2026-09-27");
    expect(mondayOf(todayPacific(new Date("2026-09-28T03:00:00Z")))).toBe("2026-09-21");
  });
});
