import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Availability,
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

export type AvailabilityLink = { token: string; month: string; expires_at: string };

export async function getActiveAvailabilityLinkForMonth(month: string): Promise<AvailabilityLink | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_links")
    .select("token, month, expires_at")
    .eq("month", month)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as AvailabilityLink | null;
}
