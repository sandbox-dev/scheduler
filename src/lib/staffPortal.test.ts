import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  formatClock,
  photoStartMinutes,
  groupStartMinutes,
  arrivalMinutes,
  computeStaffPortalDayTimes,
  TBD_TIMES,
  computeStaffPortalBlockTimes,
  orderStaffPortalRows,
  applyStaffPortalArrivalGrouping,
  computeStaffPortalTimelineRows,
  formatClockRange,
  staffPortalArrivalRange,
  sortStaffPortalCrew,
  staffPortalSchoolTypeLabel,
  visibleStaffPortalCustomFields,
  computeJobDayPosition,
  type StaffPortalBlock,
  type StaffPortalTimelineDay,
  type StaffPortalScheduledBlock,
  type StaffPortalCrewMember,
} from "./staffPortal";

// Every field a real block carries, defaulted to an inert value, so each
// test only has to spell out what it's actually exercising — same idea as
// timeline-builder's own test fixtures for this same arithmetic.
function block(overrides: Partial<StaffPortalBlock> & Pick<StaffPortalBlock, "id" | "block_type" | "sort_order">): StaffPortalBlock {
  return {
    lane: "main",
    section_label: "",
    grade_label: "",
    teacher_name: "",
    age_band: "",
    student_count: 0,
    individual_minutes_per_student: 0,
    duration_minutes: 0,
    cap_gown_count: 0,
    note_text: "",
    fixed_start_time: null,
    arrival_group_id: null,
    arrival_group_label: null,
    ...overrides,
  };
}

function day(overrides: Partial<StaffPortalTimelineDay> & { blocks: StaffPortalBlock[] }): StaffPortalTimelineDay {
  return {
    event_date: "2026-09-19",
    school_start_time: "08:00",
    photo_start_offset_minutes: 30,
    group_start_offset_minutes: null,
    individual_setups: 1,
    ...overrides,
  };
}

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

describe("formatClockRange", () => {
  it("drops the repeated AM/PM when both ends share one", () => {
    expect(formatClockRange(timeToMinutes("08:50"), timeToMinutes("09:00"))).toBe("8:50–9:00 AM");
  });

  it("spells out both periods when they differ", () => {
    expect(formatClockRange(timeToMinutes("11:45"), timeToMinutes("12:00"))).toBe("11:45 AM–12:00 PM");
  });
});

describe("staffPortalArrivalRange", () => {
  it("spans exactly the 60 minutes before photography starts", () => {
    const fields = { school_start_time: "08:00", photo_start_offset_minutes: 30, group_start_offset_minutes: null, end_time: "12:00" };
    const range = staffPortalArrivalRange(fields);
    expect(range).toEqual({ startMinutes: timeToMinutes("07:30"), endMinutes: timeToMinutes("08:30") });
  });
});

describe("computeStaffPortalBlockTimes", () => {
  it("runs main-track blocks back to back in sort_order, ignoring insertion order", () => {
    const d = day({
      blocks: [
        block({ id: "b2", block_type: "break", sort_order: 2, duration_minutes: 10 }),
        block({ id: "b1", block_type: "individual", sort_order: 1, grade_label: "Kinder", student_count: 10, individual_minutes_per_student: 2 }),
      ],
    });
    const scheduled = computeStaffPortalBlockTimes(d);
    const b1 = scheduled.find((b) => b.id === "b1")!;
    const b2 = scheduled.find((b) => b.id === "b2")!;
    // photo start = 8:00 + 30 = 8:30
    expect(b1.startMinutes).toBe(timeToMinutes("08:30"));
    expect(b1.endMinutes).toBe(timeToMinutes("08:50")); // 10 students x 2 min
    expect(b2.startMinutes).toBe(b1.endMinutes);
    expect(b2.endMinutes).toBe(b2.startMinutes + 10);
  });

  it("divides individual duration across multiple setups, plus flat padding", () => {
    const d = day({
      individual_setups: 2,
      blocks: [block({ id: "b1", block_type: "individual", sort_order: 1, student_count: 18, individual_minutes_per_student: 2, duration_minutes: 4 })],
    });
    const [b1] = computeStaffPortalBlockTimes(d);
    // (18*2 + 4) / 2 = 20 minutes
    expect(b1.endMinutes - b1.startMinutes).toBe(20);
  });

  it("a hand-set fixed_start_time wins, and later blocks continue from where it ends", () => {
    const d = day({
      blocks: [
        block({ id: "b1", block_type: "break", sort_order: 1, duration_minutes: 10 }),
        block({ id: "b2", block_type: "break", sort_order: 2, duration_minutes: 10, fixed_start_time: "09:00" }),
        block({ id: "b3", block_type: "break", sort_order: 3, duration_minutes: 5 }),
      ],
    });
    const scheduled = computeStaffPortalBlockTimes(d);
    expect(scheduled.find((b) => b.id === "b2")!.startMinutes).toBe(timeToMinutes("09:00"));
    expect(scheduled.find((b) => b.id === "b3")!.startMinutes).toBe(timeToMinutes("09:10"));
  });

  it("keeps the group track on its own clock, concurrent with the main track", () => {
    const d = day({
      photo_start_offset_minutes: 30, // individuals start 8:30
      group_start_offset_minutes: 0, // group also starts 8:30 by default
      blocks: [
        block({ id: "main1", block_type: "individual", sort_order: 1, grade_label: "1st Grade", student_count: 10, individual_minutes_per_student: 3 }),
        block({ id: "grp1", block_type: "group", lane: "group", sort_order: 1, grade_label: "2nd Grade", duration_minutes: 15 }),
      ],
    });
    const scheduled = computeStaffPortalBlockTimes(d);
    const grp1 = scheduled.find((b) => b.id === "grp1")!;
    // No grade_label clash with "1st Grade", so the group track starts at
    // its own start time, unaffected by the main track's own length.
    expect(grp1.startMinutes).toBe(timeToMinutes("08:30"));
  });

  it("pushes a class's own group photo after its individual photo, plus the gap, when they'd otherwise clash", () => {
    const d = day({
      photo_start_offset_minutes: 30,
      group_start_offset_minutes: 0,
      blocks: [
        block({ id: "main1", block_type: "individual", sort_order: 1, grade_label: "Kinder", student_count: 10, individual_minutes_per_student: 3 }), // 8:30-9:00
        block({ id: "grp1", block_type: "group", lane: "group", sort_order: 1, grade_label: "Kinder", duration_minutes: 10 }),
      ],
    });
    const scheduled = computeStaffPortalBlockTimes(d);
    const grp1 = scheduled.find((b) => b.id === "grp1")!;
    // Individual "Kinder" runs 8:30-9:00; the group photo for the SAME
    // grade can't run at the same time, so it's pushed to 9:00 + 5 min gap.
    expect(grp1.startMinutes).toBe(timeToMinutes("09:05"));
  });
});

describe("orderStaffPortalRows", () => {
  it("leaves an already-interleaved day in plain sort_order", () => {
    const rows = [
      { id: "a", lane: "main" as const, sort_order: 1 },
      { id: "b", lane: "group" as const, sort_order: 2 },
      { id: "c", lane: "main" as const, sort_order: 3 },
    ];
    expect(orderStaffPortalRows(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("reads a day still stored as two legacy tracks with the group rows first", () => {
    const rows = [
      { id: "main1", lane: "main" as const, sort_order: 1 },
      { id: "main2", lane: "main" as const, sort_order: 2 },
      { id: "grp1", lane: "group" as const, sort_order: 3 },
      { id: "grp2", lane: "group" as const, sort_order: 4 },
    ];
    expect(orderStaffPortalRows(rows).map((r) => r.id)).toEqual(["grp1", "grp2", "main1", "main2"]);
  });
});

describe("applyStaffPortalArrivalGrouping", () => {
  function scheduled(overrides: Partial<StaffPortalScheduledBlock> & Pick<StaffPortalScheduledBlock, "id" | "startMinutes" | "endMinutes">): StaffPortalScheduledBlock {
    return { ...block({ id: overrides.id, block_type: "individual", sort_order: 0 }), ...overrides };
  }

  it("leaves a block with no arrival_group_id alone", () => {
    const rows = [scheduled({ id: "a", startMinutes: 0, endMinutes: 10 })];
    expect(applyStaffPortalArrivalGrouping(rows)).toEqual(rows);
  });

  it("merges a consecutive run sharing the same arrival_group_id into one row", () => {
    const rows = [
      scheduled({ id: "a", startMinutes: 0, endMinutes: 10, arrival_group_id: "g1", arrival_group_label: "K + 1st", grade_label: "Kinder", student_count: 10 }),
      scheduled({ id: "b", startMinutes: 10, endMinutes: 25, arrival_group_id: "g1", grade_label: "1st Grade", student_count: 15 }),
    ];
    const result = applyStaffPortalArrivalGrouping(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      grade_label: "K + 1st",
      student_count: 25,
      startMinutes: 0,
      endMinutes: 25,
    });
  });

  it("does not merge across a non-matching row in between", () => {
    const rows = [
      scheduled({ id: "a", startMinutes: 0, endMinutes: 10, arrival_group_id: "g1" }),
      scheduled({ id: "b", startMinutes: 10, endMinutes: 20, arrival_group_id: null }),
      scheduled({ id: "c", startMinutes: 20, endMinutes: 30, arrival_group_id: "g1" }),
    ];
    expect(applyStaffPortalArrivalGrouping(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("computeStaffPortalTimelineRows", () => {
  it("no sent/approved version case is the caller's job (null), not this function's", () => {
    // computeStaffPortalTimelineRows takes a real day — the "nothing sent
    // yet" case is handled by the caller never having a day to pass in
    // (see getStaffPortalFullTimeline in src/lib/data.ts, which fails
    // closed to an empty map).
    const d = day({ blocks: [block({ id: "b1", block_type: "note", sort_order: 1, note_text: "Reminder: bring extra batteries" })] });
    const rows = computeStaffPortalTimelineRows(d);
    expect(rows).toHaveLength(1);
    expect(rows[0].note_text).toBe("Reminder: bring extra batteries");
  });

  it("schedules, orders, and arrival-groups a realistic mixed day end to end", () => {
    const d = day({
      blocks: [
        block({ id: "header", block_type: "section_header", sort_order: 1, section_label: "Morning" }),
        block({ id: "k1", block_type: "individual", sort_order: 2, grade_label: "Kinder A", student_count: 8, individual_minutes_per_student: 2, arrival_group_id: "g1", arrival_group_label: "Kinder A + B" }),
        block({ id: "k2", block_type: "individual", sort_order: 3, grade_label: "Kinder B", student_count: 6, individual_minutes_per_student: 2, arrival_group_id: "g1" }),
        block({ id: "brk", block_type: "break", sort_order: 4, duration_minutes: 10, section_label: "Morning Break" }),
      ],
    });
    const rows = computeStaffPortalTimelineRows(d);
    expect(rows.map((r) => r.id)).toEqual(["header", "k1", "brk"]); // k1+k2 merged under k1's id
    expect(rows[1].grade_label).toBe("Kinder A + B");
    expect(rows[1].student_count).toBe(14);
  });
});

describe("sortStaffPortalCrew", () => {
  function member(overrides: Partial<StaffPortalCrewMember>): StaffPortalCrewMember {
    return { name: "Someone", role: "Assistant", ...overrides };
  }

  it("orders Supervisor, Photographer, Assistant, then Trainee — not database/insertion order", () => {
    const crew = [
      member({ name: "Zoe", role: "Trainee" }),
      member({ name: "Ana", role: "Assistant" }),
      member({ name: "Kai", role: "Photographer" }),
      member({ name: "Bo", role: "Supervisor" }),
    ];
    expect(sortStaffPortalCrew(crew).map((m) => m.role)).toEqual(["Supervisor", "Photographer", "Assistant", "Trainee"]);
  });

  it("sorts alphabetically by name within the same role", () => {
    const crew = [member({ name: "Zed", role: "Photographer" }), member({ name: "Ada", role: "Photographer" })];
    expect(sortStaffPortalCrew(crew).map((m) => m.name)).toEqual(["Ada", "Zed"]);
  });

  it("does not mutate the input array", () => {
    const crew = [member({ name: "Zed", role: "Trainee" }), member({ name: "Ada", role: "Supervisor" })];
    const original = [...crew];
    sortStaffPortalCrew(crew);
    expect(crew).toEqual(original);
  });
});

describe("visibleStaffPortalCustomFields", () => {
  it("drops a field with a blank value", () => {
    const fields = [
      { id: "1", label: "Group Photo Location", value: "" },
      { id: "2", label: "Parking", value: "Lot B" },
    ];
    expect(visibleStaffPortalCustomFields(fields).map((f) => f.id)).toEqual(["2"]);
  });

  it("drops a field whose value is only whitespace", () => {
    const fields = [{ id: "1", label: "Group Photo Location", value: "   " }];
    expect(visibleStaffPortalCustomFields(fields)).toEqual([]);
  });

  it("keeps every field when all have real values", () => {
    const fields = [
      { id: "1", label: "Group Photo Location", value: "Gym" },
      { id: "2", label: "Parking", value: "Lot B" },
    ];
    expect(visibleStaffPortalCustomFields(fields)).toEqual(fields);
  });

  it("does not mutate the input array", () => {
    const fields = [
      { id: "1", label: "A", value: "" },
      { id: "2", label: "B", value: "x" },
    ];
    const original = [...fields];
    visibleStaffPortalCustomFields(fields);
    expect(fields).toEqual(original);
  });
});

describe("staffPortalSchoolTypeLabel", () => {
  it("prefers the finer-grained school_type when it's set", () => {
    expect(staffPortalSchoolTypeLabel({ category: "K-12", school_type: "TK-8" })).toBe("TK-8");
  });

  it("falls back to category when school_type is blank", () => {
    expect(staffPortalSchoolTypeLabel({ category: "Preschool", school_type: "" })).toBe("Preschool");
  });

  it("falls back to category when school_type is only whitespace", () => {
    expect(staffPortalSchoolTypeLabel({ category: "K-12", school_type: "   " })).toBe("K-12");
  });
});

describe("computeJobDayPosition", () => {
  it("is day 1 of 1 for a genuinely single-day job", () => {
    expect(computeJobDayPosition("2026-09-19", ["2026-09-19"])).toEqual({ dayNumber: 1, dayCount: 1 });
  });

  it("counts every day of the job, not just the ones this staff member is on", () => {
    // The real bug this fixes: a staff member working ONLY the second day
    // of a 2-day job must still see "Day 2 of 2," not "Day 1 of 1" — so the
    // full list of the job's dates (not a personal subset) must be passed
    // in, and this staff member's one day must rank correctly within it.
    const allDatesForJob = ["2026-09-18", "2026-09-19"];
    expect(computeJobDayPosition("2026-09-19", allDatesForJob)).toEqual({ dayNumber: 2, dayCount: 2 });
    expect(computeJobDayPosition("2026-09-18", allDatesForJob)).toEqual({ dayNumber: 1, dayCount: 2 });
  });

  it("ranks correctly regardless of input order", () => {
    const allDatesForJob = ["2026-09-21", "2026-09-19", "2026-09-20"];
    expect(computeJobDayPosition("2026-09-20", allDatesForJob)).toEqual({ dayNumber: 2, dayCount: 3 });
  });

  it("dedupes two picture_days rows sharing the same calendar date", () => {
    const allDatesForJob = ["2026-09-19", "2026-09-19", "2026-09-20"];
    expect(computeJobDayPosition("2026-09-20", allDatesForJob)).toEqual({ dayNumber: 2, dayCount: 2 });
  });

  it("falls back to day 1 of 1 if thisDate is somehow not in the list (defensive only)", () => {
    expect(computeJobDayPosition("2026-09-25", ["2026-09-19", "2026-09-20"])).toEqual({ dayNumber: 1, dayCount: 2 });
  });

  it("handles an empty list without throwing", () => {
    expect(computeJobDayPosition("2026-09-19", [])).toEqual({ dayNumber: 1, dayCount: 1 });
  });
});
