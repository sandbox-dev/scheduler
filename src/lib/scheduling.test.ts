import { describe, it, expect } from "vitest";
import {
  crewFor,
  isGroupPhotoSlot,
  requiredQualificationsFor,
  distanceFor,
  roleCandidates,
  generateSchedule,
  groupIdsByDate,
  mileagePayFor,
  mileageReport,
  type DistanceMap,
} from "./scheduling";
import type { JobWithDays, Staff, Availability } from "./types";

const baseDay = {
  setups: 2,
  requires_supervisor: false,
  has_group_photo: false,
  has_trainee: false,
  photographer_adjustment: 0,
  assistant_adjustment: 0,
  supervisor_adjustment: 0,
};

describe("crewFor", () => {
  it("gives 1 photographer and 1 assistant per setup with no flags", () => {
    expect(crewFor({ ...baseDay, setups: 3 })).toEqual({
      Photographer: 3,
      Assistant: 3,
      Supervisor: 0,
      Trainee: 0,
    });
  });

  it("adds one extra photographer for group photo, without adding an assistant", () => {
    expect(crewFor({ ...baseDay, setups: 2, has_group_photo: true })).toEqual({
      Photographer: 3,
      Assistant: 2,
      Supervisor: 0,
      Trainee: 0,
    });
  });

  it("trades one assistant for one supervisor when requires_supervisor is set", () => {
    expect(crewFor({ ...baseDay, setups: 2, requires_supervisor: true })).toEqual({
      Photographer: 2,
      Assistant: 1,
      Supervisor: 1,
      Trainee: 0,
    });
  });

  it("never lets assistant count go below 0 when supervisor is required on a 0-setup day", () => {
    expect(crewFor({ ...baseDay, setups: 0, requires_supervisor: true }).Assistant).toBe(0);
  });

  it("has_trainee adds a plain supplemental slot regardless of adjustments", () => {
    expect(crewFor({ ...baseDay, has_trainee: true }).Trainee).toBe(1);
  });

  it("applies manual adjustments on top of the formula", () => {
    const crew = crewFor({ ...baseDay, setups: 2, photographer_adjustment: 1, assistant_adjustment: -1 });
    expect(crew.Photographer).toBe(3);
    expect(crew.Assistant).toBe(1);
  });

  it("clamps a negative adjustment so a role never goes below 0", () => {
    const crew = crewFor({ ...baseDay, setups: 1, assistant_adjustment: -5, supervisor_adjustment: -5 });
    expect(crew.Assistant).toBe(0);
    expect(crew.Supervisor).toBe(0);
  });
});

describe("isGroupPhotoSlot", () => {
  it("is true only for the last Photographer slot on a has_group_photo day", () => {
    const jd = { setups: 2, has_group_photo: true };
    expect(isGroupPhotoSlot(jd, "Photographer", 2)).toBe(true);
    expect(isGroupPhotoSlot(jd, "Photographer", 0)).toBe(false);
    expect(isGroupPhotoSlot(jd, "Photographer", 1)).toBe(false);
  });

  it("is false for any slot when has_group_photo is false", () => {
    expect(isGroupPhotoSlot({ setups: 2, has_group_photo: false }, "Photographer", 2)).toBe(false);
  });

  it("is false for a non-Photographer role even at the matching index", () => {
    expect(isGroupPhotoSlot({ setups: 2, has_group_photo: true }, "Assistant", 2)).toBe(false);
  });
});

describe("requiredQualificationsFor", () => {
  const jd = { setups: 2, is_outdoor: false, is_babies: false, has_group_photo: false, category: "K-12" };

  it("always requires the job's category", () => {
    expect(requiredQualificationsFor(jd, "Assistant", 0)).toEqual(["K-12"]);
  });

  it("adds Outdoor Photography only for a Photographer slot on an outdoor day", () => {
    const outdoor = { ...jd, is_outdoor: true };
    expect(requiredQualificationsFor(outdoor, "Photographer", 0)).toEqual(["K-12", "Outdoor Photography"]);
    expect(requiredQualificationsFor(outdoor, "Assistant", 0)).toEqual(["K-12"]);
  });

  it("adds Babies Photography only for a Photographer slot on a babies day", () => {
    const babies = { ...jd, is_babies: true };
    expect(requiredQualificationsFor(babies, "Photographer", 0)).toEqual(["K-12", "Babies Photography"]);
  });

  it("adds Group Photography only to the one dedicated group-photo slot", () => {
    const group = { ...jd, has_group_photo: true };
    expect(requiredQualificationsFor(group, "Photographer", 2)).toEqual(["K-12", "Group Photography"]);
    expect(requiredQualificationsFor(group, "Photographer", 0)).toEqual(["K-12"]);
  });

  it("stacks outdoor + group on the group slot of an outdoor day", () => {
    const both = { ...jd, is_outdoor: true, has_group_photo: true };
    expect(requiredQualificationsFor(both, "Photographer", 2)).toEqual([
      "K-12",
      "Outdoor Photography",
      "Group Photography",
    ]);
  });
});

describe("distanceFor", () => {
  it("uses the staff-to-school lookup when one exists", () => {
    const map: DistanceMap = new Map([["staff1_school1", 5]]);
    expect(distanceFor({ id: "staff1", distance_miles: 50 }, "school1", map)).toBe(5);
  });

  it("falls back to the staff member's general distance with no lookup", () => {
    const map: DistanceMap = new Map();
    expect(distanceFor({ id: "staff1", distance_miles: 50 }, "school1", map)).toBe(50);
  });

  it("falls back to the general distance when schoolId is null", () => {
    const map: DistanceMap = new Map([["staff1_school1", 5]]);
    expect(distanceFor({ id: "staff1", distance_miles: 50 }, null, map)).toBe(50);
  });
});

function makeStaff(overrides: Partial<Staff>): Staff {
  return {
    id: "s1",
    name: "Test Staff",
    roles: [],
    categories: [],
    priority: 1,
    distance_miles: 0,
    location: "",
    phone: "",
    email: "",
    active: true,
    mileage_eligible: true,
    pin: "0000",
    ...overrides,
  };
}

describe("roleCandidates", () => {
  const staff = [
    makeStaff({ id: "p1", roles: ["Photographer"] }),
    makeStaff({ id: "a1", roles: ["Assistant"] }),
    makeStaff({ id: "inactive", roles: ["Photographer"], active: false }),
  ];

  it("filters to staff tagged with the role for non-Trainee roles", () => {
    expect(roleCandidates(staff, "Photographer").map((s) => s.id)).toEqual(["p1"]);
  });

  it("opens Trainee to every active staff member regardless of tagged roles", () => {
    expect(roleCandidates(staff, "Trainee").map((s) => s.id).sort()).toEqual(["a1", "p1"]);
  });

  it("excludes inactive staff from every role, including Trainee", () => {
    const ids = roleCandidates(staff, "Trainee").map((s) => s.id);
    expect(ids).not.toContain("inactive");
  });
});

describe("groupIdsByDate", () => {
  it("groups multiple ids sharing the same date into one entry", () => {
    const result = groupIdsByDate([
      { id: "pd1", date: "2026-09-10" },
      { id: "pd2", date: "2026-09-10" },
      { id: "pd3", date: "2026-09-05" },
    ]);
    expect(result).toEqual([
      { date: "2026-09-05", ids: ["pd3"] },
      { date: "2026-09-10", ids: ["pd1", "pd2"] },
    ]);
  });

  it("returns dates sorted chronologically regardless of input order", () => {
    const result = groupIdsByDate([
      { id: "a", date: "2026-12-01" },
      { id: "b", date: "2026-01-01" },
    ]);
    expect(result.map((r) => r.date)).toEqual(["2026-01-01", "2026-12-01"]);
  });
});

describe("mileagePayFor", () => {
  it("multiplies miles by the flat mileage rate, rounded to cents", () => {
    expect(mileagePayFor(10)).toBe(7.5);
    expect(mileagePayFor(1 / 3)).toBe(0.25);
  });
});

describe("mileageReport", () => {
  const staff = [makeStaff({ id: "s1", name: "Ann" }), makeStaff({ id: "s2", name: "Bo" })];
  const pictureDaysById = {
    pd1: { date: "2026-09-05", round_trip_miles: 20 },
    pd2: { date: "2026-09-06", round_trip_miles: 10 },
    pd3: { date: "2026-10-01", round_trip_miles: 999 },
  };

  it("sums miles per staff member across the date range and computes pay", () => {
    const rows = mileageReport(
      [
        { picture_day_id: "pd1", staff_id: "s1", role: "Photographer" },
        { picture_day_id: "pd2", staff_id: "s1", role: "Assistant" },
      ],
      pictureDaysById,
      staff,
      "2026-09-01",
      "2026-09-30"
    );
    expect(rows).toEqual([{ id: "s1", name: "Ann", daysWorked: 2, dates: ["2026-09-05", "2026-09-06"], miles: 30, pay: 22.5 }]);
  });

  it("dedupes multiple roles on the same day into a single entry", () => {
    const rows = mileageReport(
      [
        { picture_day_id: "pd1", staff_id: "s1", role: "Photographer" },
        { picture_day_id: "pd1", staff_id: "s1", role: "Supervisor" },
      ],
      pictureDaysById,
      staff,
      "2026-09-01",
      "2026-09-30"
    );
    expect(rows[0].daysWorked).toBe(1);
    expect(rows[0].miles).toBe(20);
  });

  it("excludes assignments with no staff member and days outside the range", () => {
    const rows = mileageReport(
      [
        { picture_day_id: "pd1", staff_id: null, role: "Photographer" },
        { picture_day_id: "pd3", staff_id: "s2", role: "Photographer" },
      ],
      pictureDaysById,
      staff,
      "2026-09-01",
      "2026-09-30"
    );
    expect(rows).toEqual([]);
  });
});

describe("generateSchedule", () => {
  function makeJob(overrides: Partial<JobWithDays> = {}): JobWithDays {
    return {
      id: "job1",
      school_id: "school1",
      name: "Test School",
      client: "Test School",
      category: "K-12",
      school_type: "K-8",
      enrollment: null,
      locked: false,
      picture_days: [],
      ...overrides,
    };
  }

  it("fills the group-photo slot with a group-qualified specialist first, saving generalists for regular slots", () => {
    const job = makeJob({
      picture_days: [
        {
          id: "pd1",
          job_id: "job1",
          date: "2026-09-10",
          setups: 2,
          round_trip_miles: 0,
          requires_supervisor: false,
          is_outdoor: false,
          has_group_photo: true,
          is_babies: false,
          has_trainee: false,
          needs_review: false,
          photographer_adjustment: 0,
          assistant_adjustment: 0,
          supervisor_adjustment: 0,
        },
      ],
    });

    const staff = [
      makeStaff({ id: "generalist1", roles: ["Photographer"], categories: ["K-12"], priority: 5 }),
      makeStaff({ id: "generalist2", roles: ["Photographer"], categories: ["K-12"], priority: 4 }),
      makeStaff({
        id: "group-specialist",
        roles: ["Photographer"],
        categories: ["K-12", "Group Photography"],
        priority: 1,
      }),
    ];

    const availability: Availability[] = staff.map((s) => ({
      staff_id: s.id,
      picture_day_id: "pd1",
      available: true,
    }));

    const schedule = generateSchedule([job], staff, availability);
    const slot = schedule["job1_2026-09-10"];

    // 3 Photographer slots total (2 setups + 1 group); group slot (index 2)
    // must go to the only group-qualified candidate even though they have
    // the lowest priority — the two higher-priority generalists fill the
    // two plain setup slots instead.
    expect(slot.assignments.Photographer[2]).toBe("group-specialist");
    expect(slot.assignments.Photographer.slice(0, 2).sort()).toEqual(["generalist1", "generalist2"]);
  });

  it("never double-books the same staff member across two jobs on the same date", () => {
    const jobA = makeJob({ id: "jobA", picture_days: [{
      id: "pdA", job_id: "jobA", date: "2026-09-10", setups: 1, round_trip_miles: 0,
      requires_supervisor: false, is_outdoor: false, has_group_photo: false, is_babies: false,
      has_trainee: false, needs_review: false, photographer_adjustment: 0, assistant_adjustment: 0, supervisor_adjustment: 0,
    }] });
    const jobB = makeJob({ id: "jobB", school_id: "school2", picture_days: [{
      id: "pdB", job_id: "jobB", date: "2026-09-10", setups: 1, round_trip_miles: 0,
      requires_supervisor: false, is_outdoor: false, has_group_photo: false, is_babies: false,
      has_trainee: false, needs_review: false, photographer_adjustment: 0, assistant_adjustment: 0, supervisor_adjustment: 0,
    }] });

    const onlyStaff = [makeStaff({ id: "solo", roles: ["Photographer"], categories: ["K-12"] })];
    const availability: Availability[] = [
      { staff_id: "solo", picture_day_id: "pdA", available: true },
      { staff_id: "solo", picture_day_id: "pdB", available: true },
    ];

    const schedule = generateSchedule([jobA, jobB], onlyStaff, availability);
    const assignedA = schedule["jobA_2026-09-10"].assignments.Photographer[0];
    const assignedB = schedule["jobB_2026-09-10"].assignments.Photographer[0];

    // Only one of the two jobs can claim the sole available candidate.
    expect([assignedA, assignedB].filter(Boolean).length).toBe(1);
  });

  it("leaves a slot unfilled (null) rather than assigning an unqualified candidate", () => {
    const job = makeJob({ picture_days: [{
      id: "pd1", job_id: "job1", date: "2026-09-10", setups: 1, round_trip_miles: 0,
      requires_supervisor: false, is_outdoor: true, has_group_photo: false, is_babies: false,
      has_trainee: false, needs_review: false, photographer_adjustment: 0, assistant_adjustment: 0, supervisor_adjustment: 0,
    }] });
    const staff = [makeStaff({ id: "p1", roles: ["Photographer"], categories: ["K-12"] })]; // no Outdoor Photography
    const availability: Availability[] = [{ staff_id: "p1", picture_day_id: "pd1", available: true }];

    const schedule = generateSchedule([job], staff, availability);
    expect(schedule["job1_2026-09-10"].assignments.Photographer[0]).toBeNull();
  });
});
