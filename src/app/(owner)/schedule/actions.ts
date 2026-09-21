"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAvailability, getEquipmentCases, getJobs, getSchools, getScheduleAssignments, getStaff, getStaffSchoolDistances } from "@/lib/data";
import { assignEquipmentCases, buildStaffScheduleRows, flattenJobDays, fmtDate, generateSchedule, neededDatesSummary, type FlatJobDay, type Schedule, type ScheduleSlot } from "@/lib/scheduling";
import { addDays, monthLabel } from "@/lib/month";
import { ROLES, type Role, type ScheduleAssignment } from "@/lib/types";
import { sendGmailMessage } from "@/lib/gmail";
import { scheduleApprovedEmail } from "@/lib/emails";

// Scoped to a single month and skips locked jobs entirely — their
// schedule_assignments are left untouched so a lock actually protects a
// job from being wiped and reworked when regenerating the rest of a busy
// month.
//
// Deliberately does NOT touch equipment_case (moved to its own explicit step,
// assignCasesForScope below) — Adi, 2026-09-16: cases should be a separate
// button clicked once the staffing schedule is settled, not something that
// gets silently recomputed every time Regenerate runs. Previously this
// called assignEquipmentCases() inline, which meant a case could get
// reshuffled by an unrelated Regenerate with no visible signal, and a manual
// staff swap afterward (swapAssignment, below) never touched the case at
// all — it just stayed glued to the slot rather than following whoever was
// newly in it. Every schedule_assignments row this writes now always starts
// with equipment_case: "" (the column's own default) until assignCasesForScope
// is run.
export async function generateAndSaveSchedule(month: string) {
  const [allJobs, staff, availability, staffSchoolDistances] = await Promise.all([
    getJobs(),
    getStaff(),
    getAvailability(),
    getStaffSchoolDistances(),
  ]);
  const jobs = allJobs
    .filter((j) => !j.locked)
    .map((j) => ({ ...j, picture_days: j.picture_days.filter((d) => d.date.startsWith(month.slice(0, 7))) }))
    .filter((j) => j.picture_days.length > 0);
  const schedule = generateSchedule(jobs, staff, availability, staffSchoolDistances);

  const rows: {
    picture_day_id: string;
    job_id: string;
    role: Role;
    slot_index: number;
    staff_id: string | null;
  }[] = [];

  Object.values(schedule).forEach((slot) => {
    ROLES.forEach((role) => {
      const needed = slot.crew[role] || 0;
      for (let i = 0; i < needed; i++) {
        rows.push({
          picture_day_id: slot.id,
          job_id: slot.jobId,
          role,
          slot_index: i,
          staff_id: slot.assignments[role][i] || null,
        });
      }
    });
  });

  const supabase = await createClient();

  const pictureDayIds = [...new Set(rows.map((r) => r.picture_day_id))];
  if (pictureDayIds.length > 0) {
    await supabase.from("schedule_assignments").delete().in("picture_day_id", pictureDayIds);
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("schedule_assignments").insert(rows);
    if (error) throw new Error("Couldn't save the generated schedule — please try again.");
  }

  revalidatePath("/schedule");
  revalidatePath("/mileage");
}

export async function swapAssignment(
  pictureDayId: string,
  jobId: string,
  role: Role,
  slotIndex: number,
  staffId: string | null
) {
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("locked").eq("id", jobId).single();
  if (job?.locked) throw new Error("This job is locked — unlock it on the Jobs page to make changes.");

  const { error } = await supabase.from("schedule_assignments").upsert(
    {
      picture_day_id: pictureDayId,
      job_id: jobId,
      role,
      slot_index: slotIndex,
      staff_id: staffId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "picture_day_id,role,slot_index" }
  );
  if (error) throw new Error("Couldn't save that change — please try again.");

  revalidatePath("/schedule");
  revalidatePath("/mileage");
}

// Marking a case out of commission only affects assignments made from here
// forward (assignCasesForScope, below, reads this fresh every time it runs)
// — anything already written to schedule_assignments before the flip is
// untouched, same as an already-assigned inactive staff member's row still
// displaying fine. Fixing an existing assignment that already used the
// now-inactive case means running Assign/Reassign Cases again — a separate,
// deliberate action, not automatic.
export async function setCaseActive(caseNumber: number, active: boolean) {
  const supabase = await createClient();
  await supabase.from("equipment_cases").update({ active, updated_at: new Date().toISOString() }).eq("case_number", caseNumber);
  revalidatePath("/schedule");
}

export type CaseAssignScope = { kind: "month"; month: string } | { kind: "week"; weekStart: string };
export type AssignCasesResult = { updated: number; total: number };

// Rebuilds the same Schedule shape assignEquipmentCases() needs (see
// scheduling.ts), but from whoever is ALREADY staffed in schedule_assignments
// rather than from a fresh generateSchedule() run — this must never change
// who's working, only which case they carry.
function buildScheduleFromAssignments(jobDays: FlatJobDay[], assignments: ScheduleAssignment[]): Schedule {
  const schedule: Schedule = {};
  const byPictureDay = new Map<string, ScheduleAssignment[]>();
  assignments.forEach((a) => {
    const list = byPictureDay.get(a.picture_day_id) || [];
    list.push(a);
    byPictureDay.set(a.picture_day_id, list);
  });

  jobDays.forEach((jd) => {
    const slotKey = `${jd.jobId}_${jd.date}`;
    const slot: ScheduleSlot = {
      ...jd,
      slotKey,
      assignments: { Photographer: [], Assistant: [], Supervisor: [], Trainee: [] },
    };
    ROLES.forEach((role) => {
      slot.assignments[role] = new Array(jd.crew[role] || 0).fill(null);
    });
    (byPictureDay.get(jd.id) || []).forEach((a) => {
      if (a.slot_index < slot.assignments[a.role].length) slot.assignments[a.role][a.slot_index] = a.staff_id;
    });
    schedule[slotKey] = slot;
  });

  return schedule;
}

// The explicit "Assign Cases" / "Reassign All Cases" step — Adi, 2026-09-16:
// "once we are done with the schedule, we click a button to assign cases,
// then approve the schedule... after the fact, if we make a schedule change,
// we can choose to leave the cases as is OR reassign... we can regenerate
// case assignments for the month or per week."
//
// Works on locked/approved jobs too, on purpose — a case going out of
// commission or a post-approval staffing swap doesn't care whether the
// month was already locked, and this only ever touches equipment_case, never
// staff_id, so it can't undo an approved staffing decision.
//
// mode "fillOnly" only writes a case into a Photographer slot that doesn't
// have one yet (equipment_case === "") — safe to run any time, matches
// Adi's "leave the cases as is" choice for everything already assigned.
// mode "reassignAll" recomputes and overwrites every Photographer slot in
// scope, matches her "reassign" choice.
export async function assignCasesForScope(scope: CaseAssignScope, mode: "fillOnly" | "reassignAll"): Promise<AssignCasesResult> {
  const [allJobs, staff, equipmentCaseRows, allAssignments] = await Promise.all([
    getJobs(),
    getStaff(),
    getEquipmentCases(),
    getScheduleAssignments(),
  ]);

  const inScope = (date: string) =>
    scope.kind === "month" ? date.startsWith(scope.month.slice(0, 7)) : date >= scope.weekStart && date <= addDays(scope.weekStart, 6);

  const jobs = allJobs
    .map((j) => ({ ...j, picture_days: j.picture_days.filter((d) => inScope(d.date)) }))
    .filter((j) => j.picture_days.length > 0);

  const jobDays = flattenJobDays(jobs);
  const pictureDayIds = new Set(jobDays.map((jd) => jd.id));
  const assignmentsInScope = allAssignments.filter((a) => pictureDayIds.has(a.picture_day_id));

  const schedule = buildScheduleFromAssignments(jobDays, assignmentsInScope);
  const activeCaseNumbers = equipmentCaseRows.filter((c) => c.active).map((c) => c.case_number);
  // Same low-priority-on-tie treatment as generateAndSaveSchedule used to
  // apply inline — see assignEquipmentCases' own comment for why.
  const lowPriorityStaffIds = new Set(staff.filter((s) => s.name === "Adi" || s.name === "Julia").map((s) => s.id));
  const computed = assignEquipmentCases(schedule, activeCaseNumbers, lowPriorityStaffIds);

  const photographerRows = assignmentsInScope.filter((a) => a.role === "Photographer");
  const supabase = await createClient();
  let updated = 0;

  for (const row of photographerRows) {
    const hasExisting = row.equipment_case !== "";
    if (mode === "fillOnly" && hasExisting) continue;

    const newCase = computed.get(`${row.picture_day_id}_${row.slot_index}`);
    const newValue = newCase !== undefined ? String(newCase) : "";
    if (newValue === row.equipment_case) continue;

    const { error } = await supabase.from("schedule_assignments").update({ equipment_case: newValue }).eq("id", row.id);
    if (error) throw new Error("Couldn't update case assignments — please try again.");
    updated++;
  }

  revalidatePath("/schedule");
  return { updated, total: photographerRows.length };
}

// Deliberately not gated by the job's locked flag — locking protects WHO's
// assigned (see toggleJobLock), but equipment cases are meant to stay
// editable regardless, same as assignCasesForScope's bulk Assign/Reassign
// Cases buttons already are. Fixing a case on a locked job shouldn't require
// unlocking it first.
export async function setAssignmentCase(assignmentId: string, equipmentCase: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("schedule_assignments")
    .update({ equipment_case: equipmentCase })
    .eq("id", assignmentId);
  if (error) throw new Error("Couldn't save that change — please try again.");

  revalidatePath("/schedule");
}

export type ApproveScheduleResult = { emailed: number; skippedNoEmail: string[]; failed: string[]; emailedNames: string[] };

// Addresses are stored as one free-text line (e.g. "123 Main St, Oakland, CA
// 94602"); city is the second-to-last comma-separated segment, before the
// state/zip. Returns "" if the address doesn't have enough parts to tell.
function cityFromAddress(address: string): string {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

// Marks the month approved and sends one notification email (via Gmail,
// see §6b of AGENTS.md) per staff member with assignments that month.
// Safe to click again after edits; it just re-notifies everyone currently
// assigned. Every real send is also appended to schedule_approval_send_log
// (Adi, 2026-09-21), same reasoning as availability_send_log — so a second
// owner login can see this month's notification already went out.
export async function approveSchedule(month: string): Promise<ApproveScheduleResult> {
  const supabase = await createClient();

  const { error: approvalError } = await supabase
    .from("schedule_approvals")
    .upsert({ month, approved_at: new Date().toISOString() }, { onConflict: "month" });
  if (approvalError) throw new Error("Couldn't mark the schedule approved — please try again.");


  const [jobs, staff, assignments, schools] = await Promise.all([
    getJobs(),
    getStaff(),
    getScheduleAssignments(),
    getSchools(),
  ]);

  const jobIdsThisMonth = [
    ...new Set(
      jobs.filter((j) => j.picture_days.some((d) => d.date.startsWith(month.slice(0, 7)))).map((j) => j.id)
    ),
  ];
  if (jobIdsThisMonth.length > 0) {
    await supabase.from("jobs").update({ locked: true }).in("id", jobIdsThisMonth);
  }

  const needed = neededDatesSummary(jobs).filter((n) => n.date.startsWith(month.slice(0, 7)));
  const assignmentsByDay = new Map<string, typeof assignments>();
  assignments.forEach((a) => {
    const list = assignmentsByDay.get(a.picture_day_id) || [];
    list.push(a);
    assignmentsByDay.set(a.picture_day_id, list);
  });
  const schoolAddressById = new Map(schools.map((s) => [s.id, s.address]));
  const rowsByStaffId = buildStaffScheduleRows(needed, assignmentsByDay, schoolAddressById);

  const skippedNoEmail: string[] = [];
  const failed: string[] = [];
  const emailedNames: string[] = [];

  for (const s of staff) {
    const rows = rowsByStaffId.get(s.id) || [];
    if (rows.length === 0) continue;
    if (!s.email.trim()) {
      skippedNoEmail.push(s.name);
      continue;
    }

    const { subject, htmlBody } = scheduleApprovedEmail({
      staffName: s.name,
      monthLabel: monthLabel(month),
      days: rows.map((r) => {
        const { wd, md } = fmtDate(r.date);
        return { date: `${wd} ${md}`, role: r.role, school: r.jobName, city: cityFromAddress(r.address) };
      }),
    });
    const result = await sendGmailMessage({ to: s.email, subject, htmlBody });
    if (result.ok) emailedNames.push(s.name);
    else failed.push(s.name);
  }

  // Only records who actually received one, same as availability_send_log —
  // the log stays evidence of real emails, not of attempts.
  if (emailedNames.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("schedule_approval_send_log").insert({
      month,
      sent_by: user?.email || "unknown",
      recipient_names: emailedNames,
    });
  }

  revalidatePath("/schedule");
  revalidatePath("/jobs");
  return { emailed: emailedNames.length, skippedNoEmail, failed, emailedNames };
}
