"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAvailability, getJobs, getSchools, getScheduleAssignments, getStaff, getStaffSchoolDistances } from "@/lib/data";
import { assignEquipmentCases, buildStaffScheduleRows, fmtDate, generateSchedule, neededDatesSummary } from "@/lib/scheduling";
import { monthLabel } from "@/lib/month";
import { ROLES, type Role } from "@/lib/types";

// Scoped to a single month and skips locked jobs entirely — their
// schedule_assignments are left untouched so a lock actually protects a
// job from being wiped and reworked when regenerating the rest of a busy
// month.
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
  const equipmentCases = assignEquipmentCases(schedule);

  const rows: {
    picture_day_id: string;
    job_id: string;
    role: Role;
    slot_index: number;
    staff_id: string | null;
    equipment_case: string;
  }[] = [];

  Object.values(schedule).forEach((slot) => {
    ROLES.forEach((role) => {
      const needed = slot.crew[role] || 0;
      for (let i = 0; i < needed; i++) {
        const equipmentCase = role === "Photographer" ? equipmentCases.get(`${slot.id}_${i}`) : undefined;
        rows.push({
          picture_day_id: slot.id,
          job_id: slot.jobId,
          role,
          slot_index: i,
          staff_id: slot.assignments[role][i] || null,
          equipment_case: equipmentCase !== undefined ? String(equipmentCase) : "",
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

export async function setAssignmentCase(assignmentId: string, jobId: string, equipmentCase: string) {
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("locked").eq("id", jobId).single();
  if (job?.locked) throw new Error("This job is locked — unlock it on the Jobs page to make changes.");

  const { error } = await supabase
    .from("schedule_assignments")
    .update({ equipment_case: equipmentCase })
    .eq("id", assignmentId);
  if (error) throw new Error("Couldn't save that change — please try again.");

  revalidatePath("/schedule");
}

export type ApproveScheduleResult = { emailed: number; skippedNoEmail: string[]; webhookConfigured: boolean };

// Addresses are stored as one free-text line (e.g. "123 Main St, Oakland, CA
// 94602"); city is the second-to-last comma-separated segment, before the
// state/zip. Returns "" if the address doesn't have enough parts to tell.
function cityFromAddress(address: string): string {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

// Marks the month approved and — if a Zapier webhook is configured — sends
// one notification per staff member with assignments that month, so Zapier
// can email them their confirmed dates. Safe to click again after edits;
// it just re-notifies everyone currently assigned.
export async function approveSchedule(month: string): Promise<ApproveScheduleResult> {
  const supabase = await createClient();

  const { error: approvalError } = await supabase
    .from("schedule_approvals")
    .upsert({ month, approved_at: new Date().toISOString() }, { onConflict: "month" });
  if (approvalError) throw new Error("Couldn't mark the schedule approved — please try again.");

  const webhookUrl = process.env.ZAPIER_SCHEDULE_WEBHOOK_URL;
  const webhookConfigured = !!webhookUrl;

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
  let emailed = 0;

  if (webhookConfigured) {
    for (const s of staff) {
      const rows = rowsByStaffId.get(s.id) || [];
      if (rows.length === 0) continue;
      if (!s.email.trim()) {
        skippedNoEmail.push(s.name);
        continue;
      }

      await fetch(webhookUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_name: s.name,
          staff_email: s.email,
          month,
          month_label: monthLabel(month),
          days: rows.map((r) => {
            const { wd, md } = fmtDate(r.date);
            return { date: `${wd} ${md}`, role: r.role, school: r.jobName, address: r.address, city: cityFromAddress(r.address) };
          }),
          summary: rows
            .map((r) => {
              const { wd, md } = fmtDate(r.date);
              const city = cityFromAddress(r.address);
              return `${wd} ${md} — ${r.role} at ${r.jobName}${city ? ` (${city})` : ""}`;
            })
            .join("\n"),
        }),
      });
      emailed++;
    }
  }

  revalidatePath("/schedule");
  revalidatePath("/jobs");
  return { emailed, skippedNoEmail, webhookConfigured };
}
