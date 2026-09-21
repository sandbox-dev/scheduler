import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildStaffIcsCalendar } from "@/lib/ics";
import { buildCalendarEventsForStaff, type CalendarFeedDay } from "@/lib/calendarFeed";
import type { Role } from "@/lib/types";
import type { StaffPortalTimelineFields } from "@/lib/staffPortal";

// Subscribable per-staff calendar feed — replaces Adi manually re-entering
// someone's schedule into Pixifi's own calendar by hand purely so they have
// something to subscribe to (see AGENTS.md for the full writeup).
//
// Auth model is deliberately NOT Supabase Auth / the /team login: a
// calendar app polls a plain URL on its own schedule and can't do an
// interactive sign-in. staff.calendar_token (supabase/schema.sql) IS the
// entire access control here, same shape as availability_links.token but
// non-expiring — this route never touches a Supabase Auth session or the
// staff-scoped RLS system at all, and resolves EVERYTHING (which staff
// member, which assignments) from the token alone via the service-role
// client, the same way the Zapier webhook
// (src/app/api/webhooks/zapier/jobs/route.ts) bypasses the owner-only
// "authenticated" RLS policies for its own no-logged-in-caller case. Never
// trust any other part of the request, and never return more than that one
// staff member's own assignments.
//
// The URL is expected as /api/calendar/<token>.ics — the ".ics" suffix is
// part of the dynamic [token] segment (Next.js treats it as an opaque
// string, not a real file extension), stripped below before the token
// lookup. Calendar apps generally don't require a literal ".ics" suffix to
// subscribe, but it makes the URL self-explanatory if a staff member ever
// looks at it, and matches what most real-world ICS feed URLs look like.
export const dynamic = "force-dynamic";

function icsHeaders() {
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    // This feed's whole point is staying current — never let a CDN/browser
    // serve a stale cached copy back to a polling calendar app.
    "Cache-Control": "no-store, must-revalidate",
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken.replace(/\.ics$/i, "").trim();

  if (!token) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = createServiceRoleClient();

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("id, name")
    .eq("calendar_token", token)
    .eq("active", true)
    .maybeSingle();

  if (staffError || !staffRow) {
    return new NextResponse("Not found", { status: 404 });
  }
  const staff = staffRow as { id: string; name: string };

  const calendarName = `${staff.name} — Sandbox Photographers`;

  const { data: assignments, error: assignmentsError } = await supabase
    .from("schedule_assignments")
    .select("role, picture_day_id, job_id")
    .eq("staff_id", staff.id);

  if (assignmentsError) {
    return new NextResponse("Server error", { status: 500 });
  }
  if (!assignments || assignments.length === 0) {
    return new NextResponse(buildStaffIcsCalendar(calendarName, []), { headers: icsHeaders() });
  }

  // Bounded on the past (a week-ago cutoff) so a feed doesn't grow forever
  // with years of history; unbounded on the future — the point of a
  // calendar feed is seeing everything actually booked, not just a rolling
  // week like /team's own default window.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const jobIds = [...new Set(assignments.map((a) => a.job_id as string))];
  const [{ data: pictureDays }, { data: jobs }] = await Promise.all([
    supabase.from("picture_days").select("id, date, job_id").in("job_id", jobIds).gte("date", cutoffStr),
    supabase.from("jobs").select("id, name, school_id").in("id", jobIds),
  ]);

  const pictureDayById = new Map(
    (pictureDays || []).map((pd) => [pd.id as string, pd as { id: string; date: string; job_id: string }])
  );
  const jobById = new Map((jobs || []).map((j) => [j.id as string, j as { id: string; name: string; school_id: string | null }]));

  const schoolIds = [...new Set((jobs || []).map((j) => j.school_id).filter((id): id is string => !!id))];
  const { data: schools } = schoolIds.length
    ? await supabase.from("schools").select("id, name, address").in("id", schoolIds)
    : { data: [] as { id: string; name: string; address: string }[] };
  const schoolById = new Map((schools || []).map((s) => [s.id as string, s as { id: string; name: string; address: string }]));

  // Group by Picture Day — a staff member holding two roles on the very
  // same Picture Day (an edge case this app's schema allows, e.g. both a
  // Photographer and Assistant slot) becomes ONE calendar event listing
  // both roles, not two near-duplicate entries for the same day. Also
  // drops anything outside the cutoff window (picture_day_id not present
  // in pictureDayById).
  const rolesByPictureDay = new Map<string, Set<Role>>();
  for (const a of assignments) {
    const pictureDayId = a.picture_day_id as string;
    if (!pictureDayById.has(pictureDayId)) continue;
    const set = rolesByPictureDay.get(pictureDayId) ?? new Set<Role>();
    set.add(a.role as Role);
    rolesByPictureDay.set(pictureDayId, set);
  }

  const relevantPictureDays = [...rolesByPictureDay.keys()]
    .map((id) => pictureDayById.get(id))
    .filter((pd): pd is { id: string; date: string; job_id: string } => !!pd);

  // Real start/end times, when Timeline Builder has a sent-or-approved
  // version covering the date — same cross-app source and arithmetic as
  // the staff portal's own Arrival/Start/End (src/lib/staffPortal.ts,
  // staff_portal_timeline_for_days() in supabase/schema.sql). Re-queried
  // directly here rather than through that RPC: the RPC resolves its
  // caller's staff_id from auth.uid(), which is null for this
  // service-role, no-session call — it would silently return nothing for
  // every single day. This route already knows staff.id from the token, so
  // it reads tb_jobs/tb_timeline_versions directly (service role bypasses
  // RLS the same way that RPC's own SECURITY DEFINER internals do) instead
  // of needing a second, token-shaped copy of that RPC. Fails closed to an
  // empty map (every day just shows as all-day) — same fail-closed shape as
  // getStaffPortalTimelineTimes() in src/lib/data.ts — so a hiccup here
  // can never break the whole feed.
  let timelineFieldsByPictureDay = new Map<string, StaffPortalTimelineFields>();
  try {
    timelineFieldsByPictureDay = await getTimelineFieldsForPictureDays(supabase, relevantPictureDays);
  } catch (err) {
    console.error("Calendar feed: timeline lookup failed — showing all-day events", err);
  }

  const days: CalendarFeedDay[] = [...rolesByPictureDay.entries()]
    .map(([pictureDayId, roleSet]): CalendarFeedDay | null => {
      const pd = pictureDayById.get(pictureDayId);
      if (!pd) return null;
      const job = jobById.get(pd.job_id);
      const school = job?.school_id ? schoolById.get(job.school_id) ?? null : null;
      return {
        pictureDayId,
        date: pd.date,
        roles: [...roleSet],
        jobName: job?.name ?? "Picture Day",
        schoolName: school?.name ?? null,
        schoolAddress: school?.address || null,
        timelineFields: timelineFieldsByPictureDay.get(pictureDayId) ?? null,
      };
    })
    .filter((d): d is CalendarFeedDay => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const events = buildCalendarEventsForStaff(days, staff.id, siteUrl);
  const ics = buildStaffIcsCalendar(calendarName, events);

  return new NextResponse(ics, { headers: icsHeaders() });
}

// Mirrors staff_portal_timeline_for_days()'s own lateral-join selection
// rule in plain JS: the most recent sent-or-approved Timeline Builder
// version per job (ranked by approved_at, falling back to created_at for a
// version that's only been sent, never approved), then the one day within
// that version's snapshot matching this Picture Day's date.
async function getTimelineFieldsForPictureDays(
  supabase: ReturnType<typeof createServiceRoleClient>,
  pictureDays: { id: string; date: string; job_id: string }[]
): Promise<Map<string, StaffPortalTimelineFields>> {
  const result = new Map<string, StaffPortalTimelineFields>();
  if (pictureDays.length === 0) return result;

  const schedulerJobIds = [...new Set(pictureDays.map((pd) => pd.job_id))];
  const { data: tbJobs, error: tbJobsError } = await supabase
    .from("tb_jobs")
    .select("id, scheduler_job_id")
    .in("scheduler_job_id", schedulerJobIds);
  if (tbJobsError || !tbJobs || tbJobs.length === 0) return result;

  const tbJobIdBySchedulerJobId = new Map(
    tbJobs.map((j) => [j.scheduler_job_id as string, j.id as string])
  );
  const tbJobIds = tbJobs.map((j) => j.id as string);

  const { data: versions, error: versionsError } = await supabase
    .from("tb_timeline_versions")
    .select("job_id, snapshot, approved_at, created_at, reason")
    .in("job_id", tbJobIds);
  if (versionsError || !versions) return result;

  const bestVersionByJob = new Map<string, { snapshot: Record<string, unknown>[]; rank: string }>();
  for (const v of versions) {
    const approvedAt = v.approved_at as string | null;
    if (approvedAt === null && v.reason !== "sent") continue;
    const rank = approvedAt ?? (v.created_at as string);
    const jobId = v.job_id as string;
    const existing = bestVersionByJob.get(jobId);
    if (!existing || rank > existing.rank) {
      bestVersionByJob.set(jobId, { snapshot: (v.snapshot as Record<string, unknown>[]) || [], rank });
    }
  }

  for (const pd of pictureDays) {
    const tbJobId = tbJobIdBySchedulerJobId.get(pd.job_id);
    if (!tbJobId) continue;
    const version = bestVersionByJob.get(tbJobId);
    if (!version) continue;
    const day = version.snapshot.find((elem) => elem && elem.event_date === pd.date);
    if (!day) continue;

    const school_start_time = day.school_start_time as string | null | undefined;
    const end_time = day.end_time as string | null | undefined;
    const photo_start_offset_minutes = day.photo_start_offset_minutes as number | null | undefined;
    if (school_start_time == null || end_time == null || photo_start_offset_minutes == null) continue;

    result.set(pd.id, {
      school_start_time,
      end_time,
      photo_start_offset_minutes,
      group_start_offset_minutes: (day.group_start_offset_minutes as number | null | undefined) ?? null,
    });
  }

  return result;
}
