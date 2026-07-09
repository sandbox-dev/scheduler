import {
  MILEAGE_RATE,
  type Availability,
  type JobWithDays,
  type PictureDay,
  type Qualification,
  type Role,
  type Staff,
  type StaffSchoolDistance,
} from "./types";

export function mileagePayFor(miles: number) {
  return +(miles * MILEAGE_RATE).toFixed(2);
}

export type Crew = Record<Role, number>;

// Crew rule: 1 photographer per setup. Normally 1 assistant per setup too —
// but if the job requires a supervisor, drop one assistant and add one supervisor.
// A "+ group photo" day adds one extra photographer slot on top of that,
// without adding an extra assistant. Manual adjustments (for special-case
// schools) are then applied as a delta on top of that formula, clamped so a
// role can never go negative.
export function crewFor(
  day: Pick<
    PictureDay,
    | "setups"
    | "requires_supervisor"
    | "has_group_photo"
    | "photographer_adjustment"
    | "assistant_adjustment"
    | "supervisor_adjustment"
  >
): Crew {
  const basePhotographer = day.setups + (day.has_group_photo ? 1 : 0);
  const baseAssistant = day.requires_supervisor ? Math.max(day.setups - 1, 0) : day.setups;
  const baseSupervisor = day.requires_supervisor ? 1 : 0;

  return {
    Photographer: Math.max(0, basePhotographer + day.photographer_adjustment),
    Assistant: Math.max(0, baseAssistant + day.assistant_adjustment),
    Supervisor: Math.max(0, baseSupervisor + day.supervisor_adjustment),
  };
}

// The group-photo slot is always the last Photographer slot (index ===
// setups, since Photographer count is setups + 1 on those days) — no need to
// store which index is "special" separately.
export function isGroupPhotoSlot(
  jd: Pick<PictureDay, "setups" | "has_group_photo">,
  role: Role,
  slotIndex: number
): boolean {
  return role === "Photographer" && jd.has_group_photo && slotIndex === jd.setups;
}

// Qualifications a candidate must ALL hold for a given role+slot: the job's
// school-type category always applies; Outdoor Photography applies to
// Photographer slots on outdoor-flagged days; Group Photography applies only
// to the one dedicated group-photo slot.
export function requiredQualificationsFor(
  jd: Pick<PictureDay, "setups" | "is_outdoor" | "has_group_photo"> & { category: string },
  role: Role,
  slotIndex: number
): Qualification[] {
  const required: Qualification[] = [jd.category as Qualification];
  if (role === "Photographer" && jd.is_outdoor) required.push("Outdoor Photography");
  if (isGroupPhotoSlot(jd, role, slotIndex)) required.push("Group Photography");
  return required;
}

export type FlatJobDay = PictureDay & {
  jobId: string;
  jobName: string;
  client: string;
  category: string;
  schoolType: string;
  enrollment: number | null;
  schoolId: string | null;
  crew: Crew;
};

export function flattenJobDays(jobs: JobWithDays[]): FlatJobDay[] {
  return jobs
    .flatMap((job) =>
      job.picture_days.map((d) => ({
        ...d,
        jobId: job.id,
        jobName: job.name,
        client: job.client,
        category: job.category,
        schoolType: job.school_type,
        enrollment: job.enrollment,
        schoolId: job.school_id,
        crew: crewFor(d),
      }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Maps each Picture Day's id to its position within its own job (1-indexed)
// and the job's total day count — e.g. the second date of a 2-day job gets
// { index: 2, total: 2 }, shown as "Day 2 of 2" on the print sheet/calendar.
export function jobDayPositions(jobDays: FlatJobDay[]): Map<string, { index: number; total: number }> {
  const byJob = new Map<string, FlatJobDay[]>();
  jobDays.forEach((jd) => {
    const list = byJob.get(jd.jobId) || [];
    list.push(jd);
    byJob.set(jd.jobId, list);
  });

  const positions = new Map<string, { index: number; total: number }>();
  byJob.forEach((days) => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    sorted.forEach((jd, i) => positions.set(jd.id, { index: i + 1, total: sorted.length }));
  });
  return positions;
}

export type DistanceMap = Map<string, number>;

export function buildDistanceMap(staffSchoolDistances: StaffSchoolDistance[]): DistanceMap {
  return new Map(staffSchoolDistances.map((d) => [`${d.staff_id}_${d.school_id}`, d.distance_miles]));
}

// Distance used for ranking: staff-to-school if we've looked it up, otherwise
// falls back to the staff member's distance from the studio.
export function distanceFor(
  staff: Pick<Staff, "id" | "distance_miles">,
  schoolId: string | null,
  distanceMap: DistanceMap
): number {
  if (schoolId) {
    const match = distanceMap.get(`${staff.id}_${schoolId}`);
    if (match !== undefined) return match;
  }
  return staff.distance_miles;
}

export type NeededDate = { date: string; jobs: FlatJobDay[]; totalSetups: number };

export function neededDatesSummary(jobs: JobWithDays[]): NeededDate[] {
  const byDate: Record<string, NeededDate> = {};
  flattenJobDays(jobs).forEach((jd) => {
    if (!byDate[jd.date]) byDate[jd.date] = { date: jd.date, jobs: [], totalSetups: 0 };
    byDate[jd.date].jobs.push(jd);
    byDate[jd.date].totalSetups += jd.setups;
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

export function roleCandidates(staff: Staff[], role: Role) {
  return staff.filter((s) => s.roles.includes(role));
}

export type ScheduleSlot = FlatJobDay & {
  slotKey: string;
  assignments: Record<Role, (string | null)[]>;
};

export type Schedule = Record<string, ScheduleSlot>;

export function generateSchedule(
  jobs: JobWithDays[],
  staff: Staff[],
  availability: Availability[],
  staffSchoolDistances: StaffSchoolDistance[] = []
): Schedule {
  const availByStaffAndDay = new Set(
    availability.filter((a) => a.available).map((a) => `${a.staff_id}_${a.picture_day_id}`)
  );
  const distanceMap = buildDistanceMap(staffSchoolDistances);

  const jobDays = flattenJobDays(jobs);
  const usedPerDate: Record<string, Set<string>> = {};
  const schedule: Schedule = {};

  jobDays.forEach((jd) => {
    if (!usedPerDate[jd.date]) usedPerDate[jd.date] = new Set();
    const slotKey = `${jd.jobId}_${jd.date}`;
    schedule[slotKey] = {
      ...jd,
      slotKey,
      assignments: { Photographer: [], Assistant: [], Supervisor: [] },
    };

    // Pool of candidates for a role+slot, filtered by availability, every
    // required qualification for that specific slot, and not already used
    // elsewhere that date — ranked by seniority, then distance from the job.
    const candidatesFor = (role: Role, slotIndex: number) =>
      roleCandidates(staff, role)
        .filter((s) => availByStaffAndDay.has(`${s.id}_${jd.id}`))
        .filter((s) => requiredQualificationsFor(jd, role, slotIndex).every((q) => s.categories.includes(q)))
        .filter((s) => !usedPerDate[jd.date].has(s.id))
        .sort(
          (a, b) =>
            b.seniority - a.seniority ||
            distanceFor(a, jd.schoolId, distanceMap) - distanceFor(b, jd.schoolId, distanceMap)
        );

    const assign = (role: Role, slotIndex: number) => {
      const chosen = candidatesFor(role, slotIndex)[0];
      if (!chosen) return;
      usedPerDate[jd.date].add(chosen.id);
      schedule[slotKey].assignments[role][slotIndex] = chosen.id;
    };

    // Fill order: Photographer, then Supervisor, then Assistant. Supervisor
    // is the more specialized/constrained role, so it's filled before
    // Assistant to avoid a Supervisor-qualified person getting used up on an
    // Assistant slot when they were needed as Supervisor. This is a fill
    // priority only — display order elsewhere still follows ROLES.
    const FILL_ORDER: Role[] = ["Photographer", "Supervisor", "Assistant"];

    FILL_ORDER.forEach((role) => {
      const needed = jd.crew[role] || 0;
      if (needed === 0) return;

      schedule[slotKey].assignments[role] = new Array(needed).fill(null);

      // Fill the group-photo slot first (it's the more constrained pool) so
      // a Group-qualified specialist isn't accidentally used up on a regular slot.
      if (role === "Photographer" && jd.has_group_photo) {
        assign(role, jd.setups);
        for (let i = 0; i < jd.setups; i++) assign(role, i);
      } else {
        for (let i = 0; i < needed; i++) assign(role, i);
      }
    });
  });

  return schedule;
}

export const EQUIPMENT_CASE_COUNT = 4;

// Assigns one of the studio's 4 physical equipment cases to every filled
// Photographer slot (regular setup or the group-photo slot — both need a
// case out the door). Prefers giving each photographer the SAME case for
// every job they shoot that week, since swapping cases day to day is a
// hassle; only breaks that preference when two of their jobs land on the
// same date (a case can't be in two places at once) or a fresh case needs
// picking. If more than 4 photographers work the same date, whoever doesn't
// fit is left without a case — a real capacity problem, not something to
// silently paper over.
export function assignEquipmentCases(schedule: Schedule): Map<string, number> {
  const bySlotKey = new Map<string, number>();

  const photographerSlots = Object.values(schedule).flatMap((slot) =>
    slot.assignments.Photographer
      .map((staffId, slotIndex) => ({ date: slot.date, pictureDayId: slot.id, slotIndex, staffId }))
      .filter((s): s is { date: string; pictureDayId: string; slotIndex: number; staffId: string } => !!s.staffId)
  );

  groupByWeek(photographerSlots).forEach(([, weekSlots]) => {
    const byDate = new Map<string, typeof weekSlots>();
    weekSlots.forEach((s) => {
      const list = byDate.get(s.date) || [];
      list.push(s);
      byDate.set(s.date, list);
    });

    const weeklyCaseByStaff = new Map<string, number>();

    [...byDate.keys()].sort().forEach((date) => {
      const slotsToday = byDate.get(date)!;
      const usedToday = new Set<number>();
      const unresolved: typeof slotsToday = [];

      // First pass: honor each staff member's established weekly case if it's free today.
      slotsToday.forEach((s) => {
        const preferred = weeklyCaseByStaff.get(s.staffId);
        if (preferred !== undefined && !usedToday.has(preferred)) {
          bySlotKey.set(`${s.pictureDayId}_${s.slotIndex}`, preferred);
          usedToday.add(preferred);
        } else {
          unresolved.push(s);
        }
      });

      // Second pass: hand out whatever's left to everyone else today.
      unresolved.forEach((s) => {
        let assignedCase: number | null = null;
        for (let c = 1; c <= EQUIPMENT_CASE_COUNT; c++) {
          if (!usedToday.has(c)) {
            assignedCase = c;
            break;
          }
        }
        if (assignedCase === null) return; // more photographers than cases today
        usedToday.add(assignedCase);
        bySlotKey.set(`${s.pictureDayId}_${s.slotIndex}`, assignedCase);
        if (!weeklyCaseByStaff.has(s.staffId)) weeklyCaseByStaff.set(s.staffId, assignedCase);
      });
    });
  });

  return bySlotKey;
}

export type StaffAssignmentRow = { date: string; role: Role; jobName: string; category: string; address: string };

// Every assignment for the given (already month-filtered) needed dates,
// grouped by staff member and sorted by date — the shared basis for the "By
// Staff" schedule view, its CSV export, and the schedule-approval emails.
export function buildStaffScheduleRows(
  needed: NeededDate[],
  assignmentsByDay: Map<string, { role: Role; staff_id: string | null }[]>,
  schoolAddressById: Map<string, string>
): Map<string, StaffAssignmentRow[]> {
  const rowsByStaffId = new Map<string, StaffAssignmentRow[]>();
  needed.forEach((n) => {
    n.jobs.forEach((jd) => {
      (assignmentsByDay.get(jd.id) || []).forEach((a) => {
        if (!a.staff_id) return;
        const list = rowsByStaffId.get(a.staff_id) || [];
        list.push({
          date: jd.date,
          role: a.role,
          jobName: jd.jobName,
          category: jd.category,
          address: (jd.schoolId && schoolAddressById.get(jd.schoolId)) || "",
        });
        rowsByStaffId.set(a.staff_id, list);
      });
    });
  });
  rowsByStaffId.forEach((rows) => rows.sort((a, b) => a.date.localeCompare(b.date)));
  return rowsByStaffId;
}

export type MileageRow = {
  id: string;
  name: string;
  daysWorked: number;
  dates: string[];
  miles: number;
  pay: number;
};

// Builds a per-employee mileage report for a date range, based on who was
// actually assigned to work each Picture Day (not just who was available).
export function mileageReport(
  assignments: { picture_day_id: string; staff_id: string | null; role: Role }[],
  pictureDaysById: Record<string, { date: string; round_trip_miles: number }>,
  staff: Staff[],
  startDate: string,
  endDate: string
): MileageRow[] {
  const perStaff: Record<string, { dates: string[]; miles: number }> = {};
  const seen = new Set<string>();

  assignments.forEach((a) => {
    if (!a.staff_id) return;
    const pd = pictureDaysById[a.picture_day_id];
    if (!pd) return;
    if (pd.date < startDate || pd.date > endDate) return;

    const seenKey = `${a.staff_id}_${pd.date}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);

    if (!perStaff[a.staff_id]) perStaff[a.staff_id] = { dates: [], miles: 0 };
    perStaff[a.staff_id].dates.push(pd.date);
    perStaff[a.staff_id].miles += pd.round_trip_miles;
  });

  return staff
    .map((s) => {
      const rec = perStaff[s.id];
      return {
        id: s.id,
        name: s.name,
        daysWorked: rec ? rec.dates.length : 0,
        dates: rec ? rec.dates.sort() : [],
        miles: rec ? rec.miles : 0,
        pay: rec ? mileagePayFor(rec.miles) : 0,
      };
    })
    .filter((r) => r.daysWorked > 0)
    .sort((a, b) => b.pay - a.pay);
}

export function weekOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

export function groupByWeek<T extends { date: string }>(items: T[]): [string, T[]][] {
  const weeks: Record<string, T[]> = {};
  items.forEach((n) => {
    const wk = weekOf(n.date);
    if (!weeks[wk]) weeks[wk] = [];
    weeks[wk].push(n);
  });
  return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b));
}

export function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const wd = d.toLocaleDateString(undefined, { weekday: "short" });
  const md = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { wd, md };
}
