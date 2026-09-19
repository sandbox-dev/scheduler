import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Availability,
  EquipmentCase,
  JobWithDays,
  Role,
  School,
  ScheduleAssignment,
  Staff,
  StaffSchoolDistance,
} from "@/lib/types";
import type {
  StaffPortalBriefingFields,
  StaffPortalCrewMember,
  StaffPortalTimelineDay,
  StaffPortalTimelineFields,
} from "@/lib/staffPortal";
import { sortStaffPortalCrew } from "@/lib/staffPortal";

export async function getSchools(): Promise<School[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schools").select("*").order("name");
  if (error) throw error;
  return data as School[];
}

export async function getJobs(): Promise<JobWithDays[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*, picture_days(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as JobWithDays[]).map((j) => ({
    ...j,
    picture_days: [...j.picture_days].sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

export async function getStaff(): Promise<Staff[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("staff").select("*").order("name");
  if (error) throw error;
  return data as Staff[];
}

export async function getEquipmentCases(): Promise<EquipmentCase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("equipment_cases").select("*").order("case_number");
  if (error) throw error;
  return data as EquipmentCase[];
}

export async function getAvailability(): Promise<Availability[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability")
    .select("staff_id, picture_day_id, available");
  if (error) throw error;
  return data as Availability[];
}

export async function getScheduleAssignments(): Promise<ScheduleAssignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schedule_assignments").select("*");
  if (error) throw error;
  return data as ScheduleAssignment[];
}

export async function getStaffSchoolDistances(): Promise<StaffSchoolDistance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_school_distances")
    .select("staff_id, school_id, distance_miles");
  if (error) throw error;
  return data as StaffSchoolDistance[];
}

export type AvailabilityNote = { staff_id: string; note: string };

export async function getAvailabilityNotesForMonth(month: string): Promise<AvailabilityNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_notes")
    .select("staff_id, note")
    .eq("month", month);
  if (error) throw error;
  return data as AvailabilityNote[];
}

export type AvailabilitySendLogEntry = { sent_at: string; sent_by: string; recipient_names: string[] };

// Most recent first, so whoever's about to click "Send" sees the latest
// send right at the top without having to scan the whole history.
export async function getAvailabilitySendLog(month: string): Promise<AvailabilitySendLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_send_log")
    .select("sent_at, sent_by, recipient_names")
    .eq("month", month)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data as AvailabilitySendLogEntry[];
}

export type ScheduleApproval = { month: string; approved_at: string };

export async function getApprovalForMonth(month: string): Promise<ScheduleApproval | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedule_approvals")
    .select("month, approved_at")
    .eq("month", month)
    .maybeSingle();
  if (error) throw error;
  return data as ScheduleApproval | null;
}

export type AvailabilityLink = {
  token: string;
  month: string;
  expires_at: string;
  deadline_at: string | null;
};

export async function getActiveAvailabilityLinkForMonth(month: string): Promise<AvailabilityLink | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_links")
    .select("token, month, expires_at, deadline_at")
    .eq("month", month)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as AvailabilityLink | null;
}

// Which staff members have already tapped Submit on the public availability
// link for this month, and are therefore locked out of changing their own
// answers (see AGENTS.md §8). Surfaced on the Availability Tracker so the
// owner can tell "hasn't responded" apart from "responded and can't edit" —
// the two look identical from availability rows alone, which is what made a
// changed-availability request have to arrive by email before Reopen existed.
export async function getSubmittedStaffIdsForMonth(month: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_submissions")
    .select("staff_id")
    .eq("month", month);
  if (error) throw error;
  return new Set((data as { staff_id: string }[]).map((r) => r.staff_id));
}

// This app's own `jobs.id` -> the Timeline Builder job that was imported
// FROM it, if any — reads timeline-builder's `tb_jobs` table directly (same
// Supabase project, see schema.sql's header comment; this is the only file
// in this app that reaches across into Timeline Builder's tables, mirroring
// how timeline-builder's schedulerImport.ts reaches into this app's own
// tables). Adi, 2026-09-18: "closing the loop" — from a job on the
// schedule, jump straight to its timeline. Only ever matches a job actually
// imported the normal way (Pixifi -> here -> Timeline Builder); no
// fuzzy school-name/date guessing, same reasoning timeline-builder's own
// import already uses. Fails closed to an empty map so a hiccup here can
// never take down the Schedule page itself.
export async function getTimelineBuilderJobIds(schedulerJobIds: string[]): Promise<Map<string, string>> {
  if (schedulerJobIds.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tb_jobs")
      .select("id, scheduler_job_id")
      .in("scheduler_job_id", schedulerJobIds);
    if (error) throw error;
    return new Map((data || []).map((r) => [r.scheduler_job_id as string, r.id as string]));
  } catch (err) {
    console.error("getTimelineBuilderJobIds failed — hiding the timeline links", err);
    return new Map();
  }
}

// ---------- Staff portal (mobile staff view) ----------
// Every read below relies on the staff-scoped RLS policies added alongside
// staff.auth_user_id (see supabase/schema.sql) — a staff-scoped login can
// only ever get back their own staff row, their own assignments, and the
// picture_days/jobs/schools those assignments reference, so there's no
// extra filtering needed here beyond what makes the query useful.

export type StaffPortalAccount = { id: string; name: string };

// The logged-in staff-scoped user's own staff row, or null if this login
// isn't linked to one (shouldn't normally happen — the proxy only routes a
// linked account here — but fails closed rather than showing anyone else's
// data).
export async function getMyStaffAccount(): Promise<StaffPortalAccount | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("staff")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as StaffPortalAccount | null;
}

export type StaffPortalAssignment = {
  id: string;
  role: Role;
  equipment_case: string;
  picture_day: { id: string; date: string; setups: number; is_outdoor: boolean };
  job: { id: string; name: string; reference_photos_url: string | null; category: string; school_type: string };
  school: { name: string; address: string; staff_notes: string | null } | null;
};

// Every Picture Day this staff member is assigned to, from fromDate through
// toDate inclusive (both YYYY-MM-DD) — the staff view's own "today through
// this week" window. Flat separate queries + join in JS, same pattern as
// getJobs()/getScheduleAssignments() above.
export async function getMyAssignments(
  staffId: string,
  fromDate: string,
  toDate: string
): Promise<StaffPortalAssignment[]> {
  const supabase = await createClient();

  const { data: assignments, error: assignmentsError } = await supabase
    .from("schedule_assignments")
    .select("id, role, equipment_case, picture_day_id, job_id")
    .eq("staff_id", staffId);
  if (assignmentsError) throw assignmentsError;
  if (!assignments || assignments.length === 0) return [];

  const pictureDayIds = [...new Set(assignments.map((a) => a.picture_day_id))];
  const jobIds = [...new Set(assignments.map((a) => a.job_id))];

  const [{ data: pictureDays, error: pdError }, { data: jobs, error: jobsError }] = await Promise.all([
    supabase.from("picture_days").select("id, date, setups, is_outdoor").in("id", pictureDayIds),
    supabase.from("jobs").select("id, name, school_id, reference_photos_url, category, school_type").in("id", jobIds),
  ]);
  if (pdError) throw pdError;
  if (jobsError) throw jobsError;

  const schoolIds = [...new Set((jobs || []).map((j) => j.school_id).filter((id): id is string => !!id))];
  const { data: schools, error: schoolsError } = schoolIds.length
    ? await supabase.from("schools").select("id, name, address, staff_notes").in("id", schoolIds)
    : { data: [] as { id: string; name: string; address: string; staff_notes: string | null }[], error: null };
  if (schoolsError) throw schoolsError;

  const pictureDayById = new Map((pictureDays || []).map((pd) => [pd.id as string, pd]));
  const jobById = new Map((jobs || []).map((j) => [j.id as string, j]));
  const schoolById = new Map((schools || []).map((s) => [s.id as string, s]));

  return assignments
    .map((a): StaffPortalAssignment | null => {
      const pictureDay = pictureDayById.get(a.picture_day_id);
      const job = jobById.get(a.job_id);
      if (!pictureDay || !job) return null;
      if (pictureDay.date < fromDate || pictureDay.date > toDate) return null;
      const school = job.school_id ? schoolById.get(job.school_id) ?? null : null;
      return {
        id: a.id,
        role: a.role as Role,
        equipment_case: a.equipment_case,
        picture_day: { id: pictureDay.id, date: pictureDay.date, setups: pictureDay.setups, is_outdoor: pictureDay.is_outdoor },
        job: {
          id: job.id,
          name: job.name,
          reference_photos_url: job.reference_photos_url,
          category: job.category,
          school_type: job.school_type,
        },
        school: school ? { name: school.name, address: school.address, staff_notes: school.staff_notes } : null,
      };
    })
    .filter((a): a is StaffPortalAssignment => a !== null)
    .sort((a, b) => a.picture_day.date.localeCompare(b.picture_day.date));
}

// Arrival/start/end come from Timeline Builder's own approved-or-sent
// version snapshot, via a security-definer RPC that checks this staff
// member's own assignments internally — see staff_portal_timeline_for_days
// in supabase/schema.sql for exactly why this is an RPC and not a direct
// cross-app table read. Fails closed to an empty map (every day just shows
// "TBD") so a hiccup here can never take down the staff view.
export async function getStaffPortalTimelineTimes(
  pictureDayIds: string[]
): Promise<Map<string, StaffPortalTimelineFields>> {
  if (pictureDayIds.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("staff_portal_timeline_for_days", {
      p_picture_day_ids: pictureDayIds,
    });
    if (error) throw error;
    return new Map(
      (
        data as {
          picture_day_id: string;
          school_start_time: string;
          end_time: string;
          photo_start_offset_minutes: number;
          group_start_offset_minutes: number | null;
        }[]
      ).map((r) => [
        r.picture_day_id,
        {
          school_start_time: r.school_start_time,
          end_time: r.end_time,
          photo_start_offset_minutes: r.photo_start_offset_minutes,
          group_start_offset_minutes: r.group_start_offset_minutes,
        },
      ])
    );
  } catch (err) {
    console.error("getStaffPortalTimelineTimes failed — showing TBD times", err);
    return new Map();
  }
}

// The full block-level schedule (every class/room/time) for each Picture
// Day, straight off the same sent-or-approved Timeline Builder snapshot as
// getStaffPortalTimelineTimes above — via a separate security-definer RPC
// (staff_portal_full_timeline_for_days in supabase/schema.sql) that returns
// the whole matched day as jsonb rather than 4 scalar fields, since the
// staff view now needs the real blocks, not just the summary times. Same
// security shape (re-verifies the caller's own assignment server-side) and
// same fail-closed behavior: a hiccup here just means "View Full Timeline"
// shows nothing for that day rather than taking down the whole page.
export async function getStaffPortalFullTimeline(
  pictureDayIds: string[]
): Promise<Map<string, StaffPortalTimelineDay>> {
  if (pictureDayIds.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("staff_portal_full_timeline_for_days", {
      p_picture_day_ids: pictureDayIds,
    });
    if (error) throw error;
    return new Map(
      (data as { picture_day_id: string; day_snapshot: StaffPortalTimelineDay | null }[])
        .filter((r) => r.day_snapshot)
        .map((r) => [r.picture_day_id, r.day_snapshot as StaffPortalTimelineDay])
    );
  } catch (err) {
    console.error("getStaffPortalFullTimeline failed — hiding the full timeline", err);
    return new Map();
  }
}

// The full crew (name + role) for each Picture Day — every OTHER staff
// member also assigned that day, not just this login's own row, via
// staff_portal_crew_for_days() in supabase/schema.sql (see that function's
// own comment for why this needs a security-definer RPC rather than a
// wider policy). Pre-sorted (Supervisor/Photographer/Assistant/Trainee,
// then name) so the Day Briefing section never has to re-sort client-side.
// Fails closed to an empty map — a hiccup here just means the crew list is
// hidden for that day, not that the whole page breaks.
export async function getStaffPortalCrew(
  pictureDayIds: string[]
): Promise<Map<string, StaffPortalCrewMember[]>> {
  if (pictureDayIds.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("staff_portal_crew_for_days", {
      p_picture_day_ids: pictureDayIds,
    });
    if (error) throw error;
    const byDay = new Map<string, StaffPortalCrewMember[]>();
    for (const row of data as { picture_day_id: string; staff_name: string; role: Role }[]) {
      const list = byDay.get(row.picture_day_id) ?? [];
      list.push({ name: row.staff_name, role: row.role });
      byDay.set(row.picture_day_id, list);
    }
    for (const [day, list] of byDay) byDay.set(day, sortStaffPortalCrew(list));
    return byDay;
  } catch (err) {
    console.error("getStaffPortalCrew failed — hiding the crew list", err);
    return new Map();
  }
}

// Backdrop / wifi / day-of notes / full Pixifi Event Info parity fields for
// each Picture Day, straight off Timeline Builder's tb_jobs (and, for
// custom_fields, tb_schools) rows for that job — via
// staff_portal_briefing_for_days() in supabase/schema.sql, which also does
// the picture-day-type resolution for custom_fields server-side (see that
// function's own comment for exactly how). A day with no linked Timeline
// Builder job at all just isn't returned (map lookup comes back undefined,
// same "nothing to show" handling as the timeline maps above). Fails
// closed to an empty map on any error.
export async function getStaffPortalBriefing(
  pictureDayIds: string[]
): Promise<Map<string, StaffPortalBriefingFields>> {
  if (pictureDayIds.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("staff_portal_briefing_for_days", {
      p_picture_day_ids: pictureDayIds,
    });
    if (error) throw error;
    return new Map(
      (
        data as {
          picture_day_id: string;
          backdrop: string | null;
          wifi_network: string | null;
          wifi_password: string | null;
          notes: string | null;
          individual_photo_location: string | null;
          dress_code_note: string | null;
          additional_gear_notes: string | null;
          custom_fields: { id: string; label: string; value: string }[] | null;
        }[]
      ).map((r) => [
        r.picture_day_id,
        {
          backdrop: r.backdrop,
          wifi_network: r.wifi_network,
          wifi_password: r.wifi_password,
          notes: r.notes,
          individual_photo_location: r.individual_photo_location,
          dress_code_note: r.dress_code_note,
          additional_gear_notes: r.additional_gear_notes,
          custom_fields: r.custom_fields ?? [],
        },
      ])
    );
  } catch (err) {
    console.error("getStaffPortalBriefing failed — hiding the briefing", err);
    return new Map();
  }
}
