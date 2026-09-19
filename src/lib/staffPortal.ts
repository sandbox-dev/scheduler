// Pure arithmetic for the staff view's arrival/start/end times — no I/O.
// Mirrors timeline-builder's own photoStartMinutes()/arrivalRange()/
// formatClock() (src/lib/timeline.ts there) exactly, so a staff member sees
// the same times the school's approved timeline actually shows. Kept as a
// plain re-implementation here (not an import) since the two apps are
// separate deployments with no shared package — see
// staff_portal_timeline_for_days() in supabase/schema.sql for where these
// raw fields come from.

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
export function groupStartMinutes(fields: StaffPortalTimelineFields): number {
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
