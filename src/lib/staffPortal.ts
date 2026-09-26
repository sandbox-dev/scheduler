// Pure arithmetic for the staff view's arrival/start/end times — no I/O.
// Mirrors timeline-builder's own photoStartMinutes()/arrivalRange()/
// formatClock() (src/lib/timeline.ts there) exactly, so a staff member sees
// the same times the school's approved timeline actually shows. Kept as a
// plain re-implementation here (not an import) since the two apps are
// separate deployments with no shared package — see
// staff_portal_timeline_for_days() in supabase/schema.sql for where these
// raw fields come from.

import type { Role } from "@/lib/types";

// The raw fields staff_portal_timeline_for_days() returns for one Picture
// Day, straight off that job's sent-or-approved timeline snapshot.
export type StaffPortalTimelineFields = {
  school_start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  photo_start_offset_minutes: number;
  group_start_offset_minutes: number | null;
};

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// "8:00 AM" — same format timeline-builder shows the school.
export function formatClock(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Photography always starts a fixed number of minutes after the school's
// actual start time — see timeline-builder's photoStartMinutes().
export function photoStartMinutes(fields: Pick<StaffPortalTimelineFields, "school_start_time" | "photo_start_offset_minutes">): number {
  return timeToMinutes(fields.school_start_time) + fields.photo_start_offset_minutes;
}

// When a day runs group photos on their own offset from the individual
// track — see timeline-builder's groupStartMinutes(). Null/0 means "same
// time as individuals".
export function groupStartMinutes(
  fields: Pick<StaffPortalTimelineFields, "school_start_time" | "photo_start_offset_minutes" | "group_start_offset_minutes">
): number {
  return photoStartMinutes(fields) + (fields.group_start_offset_minutes || 0);
}

// Arrival is always exactly 60 minutes before the first camera of either
// track — see timeline-builder's arrivalRange(). A day whose group photos
// run before the individuals means arrival has to come before THOSE.
export function arrivalMinutes(fields: StaffPortalTimelineFields): number {
  return Math.min(photoStartMinutes(fields), groupStartMinutes(fields)) - 60;
}

export type StaffPortalDayTimes = { arrival: string; start: string; end: string };

// No sent/approved timeline version exists yet for this Picture Day — there's
// nothing real to show, so every field reads "TBD" rather than a guessed
// placeholder.
export const TBD_TIMES: StaffPortalDayTimes = { arrival: "TBD", start: "TBD", end: "TBD" };

export function computeStaffPortalDayTimes(fields: StaffPortalTimelineFields | null): StaffPortalDayTimes {
  if (!fields) return TBD_TIMES;
  return {
    arrival: formatClock(arrivalMinutes(fields)),
    start: formatClock(photoStartMinutes(fields)),
    end: formatClock(timeToMinutes(fields.end_time)),
  };
}

// ---------- Full block-level timeline (staff-only, read-only) ----------
// Mirrors timeline-builder's own block-scheduling arithmetic
// (computeScheduleTimes/orderTimelineRows/applyArrivalGrouping in
// src/lib/timeline.ts there) closely enough to reproduce the same read-only
// rendering the school sees on its approval page (ApprovalView.tsx) — kept
// as a plain re-implementation here rather than an import, same reasoning
// as the arrival/start/end arithmetic above (two separate deployments, no
// shared package). See staff_portal_full_timeline_for_days() in
// supabase/schema.sql for where the raw day+blocks JSON comes from.
//
// Deliberately NOT reproduced: grade-band recess/lunch avoidance and the
// dead-time/overlap warning machinery (computeBudget and friends). Those
// only ever change what gets FLAGGED for the studio while building a
// timeline — verified against timeline-builder's own scheduleMainTrack/
// scheduleGroupTrack, which accept a gradeBands argument but never use it
// to change a computed time. A read-only staff view has nothing to flag,
// so there's nothing lost by leaving that machinery out.

export type StaffPortalBlockType =
  | "section_header"
  | "individual"
  | "group"
  | "break"
  | "transition"
  | "note"
  | "staff"
  | "addin";

// The subset of timeline-builder's own Block fields (src/lib/types.ts
// there) this view actually renders or needs for scheduling arithmetic —
// copied, not invented; see that file's Block type for the full shape a
// day's snapshot may carry.
export type StaffPortalBlock = {
  id: string;
  lane: "main" | "group" | null;
  block_type: StaffPortalBlockType;
  section_label: string;
  grade_label: string;
  teacher_name: string;
  age_band: string;
  student_count: number;
  individual_minutes_per_student: number;
  duration_minutes: number;
  cap_gown_count: number;
  note_text: string;
  sort_order: number;
  fixed_start_time?: string | null;
  arrival_group_id?: string | null;
  arrival_group_label?: string | null;
};

// The subset of TimelineVersionSnapshotDay (timeline-builder's
// src/lib/types.ts) this view needs — one element of a
// tb_timeline_versions.snapshot array, as returned whole (as jsonb) by
// staff_portal_full_timeline_for_days().
export type StaffPortalTimelineDay = {
  event_date: string | null;
  school_start_time: string;
  photo_start_offset_minutes: number;
  group_start_offset_minutes: number | null;
  individual_setups: number;
  blocks: StaffPortalBlock[];
};

export type StaffPortalScheduledBlock = StaffPortalBlock & {
  startMinutes: number;
  endMinutes: number;
};

const GROUP_LANE = "group";

// Mirrors timeline-builder's own trackGapMinutes() default — the frozen
// snapshot shape this reads from predates the per-day track_gap_minutes
// override (see TimelineVersionSnapshotDay's own comment there), so every
// day this view can ever see behaves exactly like an un-migrated day
// always has: the flat 5-minute default, nothing configurable.
const DEFAULT_TRACK_GAP_MINUTES = 5;

// Mirrors timeline-builder's own blockDurationMinutes().
function blockDurationMinutes(
  block: Pick<StaffPortalBlock, "block_type" | "student_count" | "individual_minutes_per_student" | "duration_minutes">,
  individualSetups: number = 1
): number {
  if (block.block_type === "individual") {
    return (block.student_count * block.individual_minutes_per_student + (block.duration_minutes || 0)) / Math.max(1, individualSetups);
  }
  if (block.block_type === "group" || block.block_type === "break" || block.block_type === "transition" || block.block_type === "staff") {
    return block.duration_minutes;
  }
  return 0; // section_header / note / addin rows are labels, not time
}

// Mirrors timeline-builder's own roundTo5() — every clock time snaps to the
// nearest 5 minutes even though the underlying per-student math is
// fractional.
function roundTo5(mins: number): number {
  return Math.round(mins / 5) * 5;
}

// Mirrors timeline-builder's own scheduleMainTrack() — every block runs one
// at a time, back to back, in the order it was authored (sort_order).
// Always "consecutive": the individuals_consecutive per-day toggle
// postdates this frozen snapshot shape (same reasoning as
// DEFAULT_TRACK_GAP_MINUTES above), so a hand-set fixed_start_time still
// wins for that one block, but every day's cursor closes back up behind it
// exactly like every timeline behaved before that toggle existed.
function scheduleMainTrack(blocks: StaffPortalBlock[], startMinutes: number, individualSetups: number): StaffPortalScheduledBlock[] {
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  const results: StaffPortalScheduledBlock[] = [];
  let cursor = startMinutes;

  for (const b of ordered) {
    const dur = blockDurationMinutes(b, individualSetups);
    const setStart = b.fixed_start_time ? timeToMinutes(b.fixed_start_time) : null;
    const startAt = setStart ?? cursor;
    const endMinutes = roundTo5(startAt + dur);
    results.push({ ...b, startMinutes: startAt, endMinutes });
    cursor = endMinutes;
  }

  return results;
}

// Mirrors timeline-builder's own scheduleGroupTrack() — the group track runs
// on its own clock, concurrently with the main track, except a group block
// can't run at the same time as that same class's own individual block (the
// one thing individual photography is allowed to move group photography
// around).
function scheduleGroupTrack(
  blocks: StaffPortalBlock[],
  startMinutes: number,
  individualTimesByGrade: Map<string, { start: number; end: number }>
): StaffPortalScheduledBlock[] {
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  const results: StaffPortalScheduledBlock[] = [];
  let cursor = startMinutes;

  for (const b of ordered) {
    const dur = blockDurationMinutes(b);
    const setStart = b.fixed_start_time ? timeToMinutes(b.fixed_start_time) : null;

    let earliest = cursor;
    const ind = b.grade_label ? individualTimesByGrade.get(b.grade_label.trim().toLowerCase()) : undefined;
    if (ind) {
      const clashes = (from: number) => {
        const to = from + dur;
        const gap = to <= ind.start ? ind.start - to : from >= ind.end ? from - ind.end : -1;
        return gap < DEFAULT_TRACK_GAP_MINUTES;
      };
      if (clashes(earliest)) earliest = ind.end + DEFAULT_TRACK_GAP_MINUTES;
    }

    const startAt = setStart ?? earliest;
    const endMinutes = roundTo5(startAt + dur);
    results.push({ ...b, startMinutes: startAt, endMinutes });
    cursor = endMinutes;
  }

  return results;
}

// Mirrors timeline-builder's own computeScheduleTimes() — splits the day's
// blocks into the main track and the (dedicated-photographer) group track,
// schedules each, and hands both back as one flat list.
export function computeStaffPortalBlockTimes(day: StaffPortalTimelineDay): StaffPortalScheduledBlock[] {
  const start = roundTo5(photoStartMinutes(day));
  const groupStart = roundTo5(groupStartMinutes(day));
  const mainBlocks = day.blocks.filter((b) => (b.lane || "main") !== GROUP_LANE);
  const groupBlocks = day.blocks.filter((b) => b.lane === GROUP_LANE);
  const mainScheduled = scheduleMainTrack(mainBlocks, start, day.individual_setups || 1);

  const individualTimesByGrade = new Map<string, { start: number; end: number }>();
  for (const b of mainScheduled) {
    if (b.block_type === "individual" && b.grade_label) {
      individualTimesByGrade.set(b.grade_label.trim().toLowerCase(), { start: b.startMinutes, end: b.endMinutes });
    }
  }

  const groupScheduled = scheduleGroupTrack(groupBlocks, groupStart, individualTimesByGrade);
  return [...mainScheduled, ...groupScheduled];
}

function runsAlongside(row: { lane?: string | null }): boolean {
  return (row.lane || "main") === GROUP_LANE;
}

// Mirrors timeline-builder's own oneListOrder()/orderTimelineRows() — one
// list, in the order it was authored (sort_order), except for a day still
// stored the old two-track way (every group row sorted after every main
// row), which reads with the group rows first, matching how those always
// printed.
export function orderStaffPortalRows<T extends { lane?: string | null; sort_order: number }>(rows: T[]): T[] {
  const base = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const alongside = base.filter(runsAlongside);
  const mainLine = base.filter((r) => !runsAlongside(r));
  if (alongside.length === 0 || mainLine.length === 0) return base;

  const storedAsTwoTracks = Math.min(...alongside.map((r) => r.sort_order)) > Math.max(...mainLine.map((r) => r.sort_order));
  return storedAsTwoTracks ? [...alongside, ...mainLine] : base;
}

// Mirrors timeline-builder's own applyArrivalGrouping() — collapses a
// consecutive run of blocks sharing the same arrival_group_id into one
// combined display row (classes called at the same time), purely for
// display; doesn't change any of the underlying blocks' own real data.
export function applyStaffPortalArrivalGrouping(blocks: StaffPortalScheduledBlock[]): StaffPortalScheduledBlock[] {
  const result: StaffPortalScheduledBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const groupId = blocks[i].arrival_group_id;
    if (!groupId) {
      result.push(blocks[i]);
      i++;
      continue;
    }
    const members: StaffPortalScheduledBlock[] = [blocks[i]];
    let j = i + 1;
    while (j < blocks.length && blocks[j].arrival_group_id === groupId) {
      members.push(blocks[j]);
      j++;
    }
    if (members.length === 1) {
      result.push(blocks[i]);
    } else {
      const first = members[0];
      result.push({
        ...first,
        grade_label: first.arrival_group_label || members.map((m) => m.grade_label).filter(Boolean).join(" + "),
        teacher_name: "",
        section_label: "",
        student_count: members.reduce((sum, m) => sum + m.student_count, 0),
        cap_gown_count: members.reduce((sum, m) => sum + m.cap_gown_count, 0),
        note_text: Array.from(new Set(members.map((m) => m.note_text).filter(Boolean))).join(" / "),
        startMinutes: Math.min(...members.map((m) => m.startMinutes)),
        endMinutes: Math.max(...members.map((m) => m.endMinutes)),
      });
    }
    i = j;
  }
  return result;
}

// The one call the crew page actually needs: scheduled, ordered, and
// arrival-grouped rows, ready to render top to bottom.
export function computeStaffPortalTimelineRows(day: StaffPortalTimelineDay): StaffPortalScheduledBlock[] {
  return applyStaffPortalArrivalGrouping(orderStaffPortalRows(computeStaffPortalBlockTimes(day)));
}

// ---------- Job day position ("Day N of M") ----------
// Fixed 2026-09-19: this used to be computed from only the Picture Days a
// staff member is personally assigned to on a job, which reflected "how
// many days of this job am I on," not the job's real total day count — a
// staff member covering just one day of a multi-day job couldn't tell
// whether they were walking into a job that actually started days earlier.
// Now computed from EVERY Picture Day the job has (see the widened
// "staff-scoped read own picture days" RLS policy in supabase/schema.sql,
// which is what makes those other days' dates visible at all) — this is the
// job's real day_number/day_count, not a personal subset of it.
export type JobDayPosition = { dayNumber: number; dayCount: number };

// `allDatesForJob` is every Picture Day date on the job (YYYY-MM-DD),
// regardless of who's assigned to which — may contain duplicate dates (two
// picture_days rows sharing one calendar date, e.g. two separate bookings
// landing on the same day), deduped here before ranking. `thisDate` must be
// one of them; if it somehow isn't (defensive only — shouldn't happen since
// the caller always includes the day being rendered), this falls back to
// treating it as a lone day-1-of-1 rather than throwing.
export function computeJobDayPosition(thisDate: string, allDatesForJob: string[]): JobDayPosition {
  const uniqueSortedDates = [...new Set(allDatesForJob.length ? allDatesForJob : [thisDate])].sort();
  const index = uniqueSortedDates.indexOf(thisDate);
  return {
    dayNumber: index === -1 ? 1 : index + 1,
    dayCount: uniqueSortedDates.length,
  };
}

// ---------- Day Briefing (crew list + Pixifi Event Info facts) ----------
// See staff_portal_crew_for_days() / staff_portal_briefing_for_days() in
// supabase/schema.sql for where these come from and the security shape
// that guards them.

export type StaffPortalCrewMember = { name: string; role: Role };

// One row of Adi's free-form "extra facts" list — same {id, label, value}
// shape as timeline-builder's own CustomField (src/lib/types.ts there),
// already resolved server-side to this job's actual picture-day type (see
// staff_portal_briefing_for_days()'s own comment in supabase/schema.sql).
export type StaffPortalCustomField = { id: string; label: string; value: string };

// The raw fields staff_portal_briefing_for_days() returns for one Picture
// Day — straight off timeline-builder's tb_jobs row for that job, or all
// null if there's no linked Timeline Builder job at all. Each field is
// independently null when nothing's been entered, not just when the whole
// row is missing. custom_fields is always an array (possibly empty), never
// null — see that function's comment for exactly how it's resolved.
export type StaffPortalBriefingFields = {
  backdrop: string | null;
  wifi_network: string | null;
  wifi_password: string | null;
  notes: string | null;
  individual_photo_location: string | null;
  dress_code_note: string | null;
  additional_gear_notes: string | null;
  parking_notes: string | null;
  custom_fields: StaffPortalCustomField[];
  // Moved 2026-09-19 from this app's own schools.staff_notes/
  // reference_photos_url/setup_photos_url to Timeline Builder's tb_schools
  // (location_notes/reference_photos_url/setup_photos_url there) — see
  // staff_portal_briefing_for_days()'s own comment in supabase/schema.sql.
  // Same "independently null" shape as every other field here.
  location_notes: string | null;
  reference_photos_url: string | null;
  setup_photos_url: string | null;
};

// A custom field Adi added with no value filled in yet shouldn't clutter
// the Day Briefing — same "only show a fact if it has a real value" rule
// every other fact in that section already follows.
export function visibleStaffPortalCustomFields(fields: StaffPortalCustomField[]): StaffPortalCustomField[] {
  return fields.filter((f) => f.value.trim() !== "");
}

// Supervisor, then Photographer, then Assistant, then Trainee — mirrors
// timeline-builder's own Pixifi Event Info staff-list ordering (ROLE_ORDER
// in pixifiEventInfo.ts) so the same crew reads in the same order whichever
// app shows it, rather than whatever order the database happens to return
// rows in. Alphabetical by name within a role, for a stable order when two
// people share a role.
const CREW_ROLE_ORDER: Role[] = ["Supervisor", "Photographer", "Assistant", "Trainee"];
function crewRoleRank(role: Role): number {
  const i = CREW_ROLE_ORDER.indexOf(role);
  return i === -1 ? CREW_ROLE_ORDER.length : i;
}

export function sortStaffPortalCrew(crew: StaffPortalCrewMember[]): StaffPortalCrewMember[] {
  return [...crew].sort((a, b) => crewRoleRank(a.role) - crewRoleRank(b.role) || a.name.localeCompare(b.name));
}

// The finer-grained school_type (e.g. "TK-8", "Pre-8", "High School") is
// more informative for a staff member glancing at a briefing than the plain
// Preschool/K-12 scheduling category, so it wins when both are set — see
// Job.school_type's own comment in src/lib/types.ts ("reference only, never
// used for scheduling"). Falls back to category when school_type hasn't
// been filled in, so the section never renders blank.
//
// A preschool always reads "Preschool" — Adi, 2026-09-25: "Preschool is always
// preschool, but all the rest should say the actual grades." Same rule as
// timeline-builder's schoolTypeLabel().
export function staffPortalSchoolTypeLabel(job: { category: string; school_type: string }): string {
  if (job.category === "Preschool") return "Preschool";
  return job.school_type.trim() || job.category;
}

// "8:50–9:00 AM" / "11:45 AM–12:00 PM" — mirrors timeline-builder's own
// formatClockRange(), dropping the repeated AM/PM when both ends share one.
export function formatClockRange(startMins: number, endMins: number): string {
  const start = formatClock(startMins);
  const end = formatClock(endMins);
  const [startTime, startPeriod] = start.split(" ");
  const [, endPeriod] = end.split(" ");
  return startPeriod === endPeriod ? `${startTime}–${end}` : `${start}–${end}`;
}

// The "ARRIVAL & SETUP" banner row shown above the first real block — always
// exactly 60 minutes before the first camera of either track, same as
// arrivalMinutes() above.
export function staffPortalArrivalRange(fields: StaffPortalTimelineFields): { startMinutes: number; endMinutes: number } {
  const start = arrivalMinutes(fields);
  return { startMinutes: start, endMinutes: start + 60 };
}
