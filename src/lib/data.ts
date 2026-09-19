import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Availability,
  EquipmentCase,
  JobWithDays,
  School,
  ScheduleAssignment,
  Staff,
  StaffSchoolDistance,
} from "@/lib/types";

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
