// Pure logic (no I/O) that turns one staff member's Picture Day
// assignments into calendar events — the shaping step between
// src/app/api/calendar/[token]/route.ts's DB reads and src/lib/ics.ts's
// RFC 5545 text writer. Same "pure logic, no I/O" split this app already
// uses for src/lib/scheduling.ts and src/lib/pixifi.ts.

import { ROLES, type Role } from "@/lib/types";
import { arrivalMinutes, timeToMinutes, type StaffPortalTimelineFields } from "@/lib/staffPortal";
import type { IcsEvent } from "@/lib/ics";

export type CalendarFeedDay = {
  pictureDayId: string;
  date: string; // YYYY-MM-DD
  roles: Role[]; // this staff member's role(s) on this one Picture Day
  jobName: string;
  schoolName: string | null;
  schoolAddress: string | null;
  // Straight off Timeline Builder's own sent-or-approved snapshot, same
  // shape staff_portal_timeline_for_days() returns — null means no such
  // version exists yet for this date, i.e. this app's own "TBD".
  timelineFields: StaffPortalTimelineFields | null;
};

// Multi-role display order (rare: a staff member double-booked into two
// roles on the very same Picture Day) matches ROLES' own priority-fill
// order from src/lib/types.ts, not whatever order the DB rows happened to
// come back in.
function sortedRoleLabel(roles: Role[]): string {
  return ROLES.filter((r) => roles.includes(r)).join(" & ");
}

export function buildCalendarEventsForStaff(days: CalendarFeedDay[], staffId: string, siteUrl: string): IcsEvent[] {
  return days.map((day) => {
    const title = day.schoolName ?? day.jobName;
    const roleLabel = sortedRoleLabel(day.roles);
    const summary = roleLabel ? `${title} — ${roleLabel}` : title;

    const description = [`Role: ${roleLabel || "—"}`, `Full crew, timeline & notes: ${siteUrl}/team`].join("\n");

    const startMinutes = day.timelineFields ? arrivalMinutes(day.timelineFields) : null;
    const endMinutes = day.timelineFields ? timeToMinutes(day.timelineFields.end_time) : null;

    return {
      // Globally unique across every staff member's separate feed
      // document (each subscribed as its own independent calendar, so
      // this only strictly needs to be unique WITHIN one feed — but
      // there's no cost to making it unique across all of them too).
      // Deliberately keyed on picture_day_id + staffId rather than the
      // underlying schedule_assignments row id: reassigning a role keeps
      // the same UID for "this person, this Picture Day" instead of
      // making the calendar app treat a reassignment as a brand-new event.
      uid: `pd-${day.pictureDayId}-${staffId}@sandboxphotographers.com`,
      date: day.date,
      startMinutes,
      endMinutes,
      summary,
      description,
      location: day.schoolAddress || undefined,
    };
  });
}
