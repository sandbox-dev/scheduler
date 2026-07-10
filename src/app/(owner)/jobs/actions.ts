"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, type Category } from "@/lib/types";

export type CreateJobState = { error?: string } | undefined;

export async function createJob(_prevState: CreateJobState, formData: FormData): Promise<CreateJobState> {
  const name = String(formData.get("name") || "").trim();
  const client = String(formData.get("client") || "").trim() || name;
  const category = String(formData.get("category") || CATEGORIES[0]) as Category;
  const schoolType = String(formData.get("schoolType") || "").trim();
  const enrollmentRaw = String(formData.get("enrollment") || "").trim();
  const enrollment = enrollmentRaw ? parseInt(enrollmentRaw, 10) : null;
  const schoolId = String(formData.get("schoolId") || "") || null;
  const schoolAddress = String(formData.get("schoolAddress") || "").trim();
  const milesInput = parseFloat(String(formData.get("milesInput") || "")) || 0;
  const saveSchool = formData.get("saveSchool") === "on";
  const pasteRows = String(formData.get("pasteRows") || "");

  if (!name || !pasteRows.trim()) {
    return { error: "Add a job name and at least one date/setup row." };
  }

  const days = pasteRows
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, setupsRaw] = line.split(",").map((s) => s.trim());
      const setupsMissing = !setupsRaw;
      return {
        date,
        setups: parseInt(setupsRaw, 10) || 1,
        round_trip_miles: milesInput,
        requires_supervisor: false,
        is_outdoor: false,
        has_group_photo: false,
        needs_review: setupsMissing,
      };
    })
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));

  if (days.length === 0) {
    return { error: "Couldn't read any rows — use format: 2026-08-11, 3" };
  }

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({ name, client, category, school_id: schoolId, school_type: schoolType, enrollment })
    .select()
    .single();

  if (jobError || !job) {
    return { error: "Couldn't create the job — please try again." };
  }

  const { error: daysError } = await supabase
    .from("picture_days")
    .insert(days.map((d) => ({ ...d, job_id: job.id })));

  if (daysError) {
    return { error: "Job was created, but Picture Days failed to save." };
  }

  if (saveSchool && !schoolId) {
    const { data: existing } = await supabase
      .from("schools")
      .select("id")
      .ilike("name", name)
      .maybeSingle();

    if (!existing) {
      await supabase.from("schools").insert({
        name,
        address: schoolAddress,
        round_trip_miles: milesInput,
      });
    }
  }

  revalidatePath("/jobs");
  revalidatePath("/overview");
}

export async function updateJobField(
  jobId: string,
  field: "school_type" | "enrollment",
  value: string | number | null
) {
  const supabase = await createClient();
  await supabase
    .from("jobs")
    .update({ [field]: value })
    .eq("id", jobId);
  revalidatePath("/jobs");
}

export async function toggleJobLock(jobId: string, locked: boolean) {
  const supabase = await createClient();
  await supabase.from("jobs").update({ locked }).eq("id", jobId);
  revalidatePath("/jobs");
  revalidatePath("/schedule");
}

export async function removeJob(jobId: string) {
  const supabase = await createClient();
  await supabase.from("jobs").delete().eq("id", jobId);
  revalidatePath("/jobs");
  revalidatePath("/overview");
}

export async function updateDay(
  dayId: string,
  field:
    | "setups"
    | "round_trip_miles"
    | "requires_supervisor"
    | "is_outdoor"
    | "has_group_photo"
    | "photographer_adjustment"
    | "assistant_adjustment"
    | "supervisor_adjustment",
  value: number | boolean | string
) {
  const supabase = await createClient();
  // Editing any field counts as the owner reviewing this Picture Day.
  await supabase
    .from("picture_days")
    .update({ [field]: value, needs_review: false })
    .eq("id", dayId);
  revalidatePath("/jobs");
  revalidatePath("/overview");
  revalidatePath("/schedule");
}

export async function updateSchoolField(
  schoolId: string,
  field: "address" | "round_trip_miles",
  value: string | number
) {
  const supabase = await createClient();
  await supabase
    .from("schools")
    .update({ [field]: value })
    .eq("id", schoolId);
  revalidatePath("/jobs");
  revalidatePath("/staff");
}
