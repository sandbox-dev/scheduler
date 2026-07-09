"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSchools, getStaff, getStaffSchoolDistances } from "@/lib/data";
import { lookupDistancesToDestination } from "@/lib/googleDistance";
import { QUALIFICATIONS, ROLES, type Qualification, type Role } from "@/lib/types";

export type AddStaffState = { error?: string } | undefined;

export async function addStaff(_prevState: AddStaffState, formData: FormData): Promise<AddStaffState> {
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Enter a name." };

  const roles = ROLES.filter((r) => formData.get(`role_${r}`) === "on") as Role[];
  const categories = QUALIFICATIONS.filter((c) => formData.get(`category_${c}`) === "on") as Qualification[];
  const seniority = Math.min(5, Math.max(1, parseInt(String(formData.get("seniority") || "1"), 10) || 1));
  const distance = parseFloat(String(formData.get("distance") || "0")) || 0;
  const location = String(formData.get("location") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const email = String(formData.get("email") || "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("staff").insert({
    name,
    roles,
    categories,
    seniority,
    distance_miles: distance,
    location,
    phone,
    email,
  });

  if (error) return { error: "Couldn't add staff member — please try again." };

  revalidatePath("/staff");
  revalidatePath("/overview");
}

export async function updateStaffField(
  staffId: string,
  field: "distance_miles" | "seniority" | "location" | "phone" | "email",
  value: number | string
) {
  const supabase = await createClient();
  await supabase
    .from("staff")
    .update({ [field]: value })
    .eq("id", staffId);
  revalidatePath("/staff");
  revalidatePath("/schedule");
}

export async function toggleStaffRole(staffId: string, role: Role, roles: Role[]) {
  const supabase = await createClient();
  const has = roles.includes(role);
  const next = has ? roles.filter((r) => r !== role) : [...roles, role];
  await supabase.from("staff").update({ roles: next }).eq("id", staffId);
  revalidatePath("/staff");
  revalidatePath("/schedule");
}

export async function toggleStaffCategory(staffId: string, category: Qualification, categories: Qualification[]) {
  const supabase = await createClient();
  const has = categories.includes(category);
  const next = has ? categories.filter((c) => c !== category) : [...categories, category];
  await supabase.from("staff").update({ categories: next }).eq("id", staffId);
  revalidatePath("/staff");
  revalidatePath("/schedule");
}

export async function setStaffActive(staffId: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("staff").update({ active }).eq("id", staffId);
  revalidatePath("/staff");
  revalidatePath("/overview");
}

export async function setStaffMileageEligible(staffId: string, mileageEligible: boolean) {
  const supabase = await createClient();
  await supabase.from("staff").update({ mileage_eligible: mileageEligible }).eq("id", staffId);
  revalidatePath("/staff");
  revalidatePath("/mileage");
}

export type SyncDistancesResult = {
  computed: number;
  skippedNoAddress: string[];
  skippedNoLocation: string[];
  unresolvableAddresses: string[];
};

// Fills in any missing staff<->school distance pairs via the Distance Matrix
// API. Never re-looks-up a pair that's already cached, so repeat runs only
// cost API calls for genuinely new staff or new schools.
export async function syncStaffSchoolDistances(): Promise<SyncDistancesResult> {
  const [staff, schools, existing] = await Promise.all([getStaff(), getSchools(), getStaffSchoolDistances()]);

  const existingPairs = new Set(existing.map((d) => `${d.staff_id}_${d.school_id}`));
  const skippedNoAddress = schools.filter((s) => !s.address.trim()).map((s) => s.name);
  const skippedNoLocation = staff.filter((s) => s.active && !s.location.trim()).map((s) => s.name);

  const schoolsWithAddress = schools.filter((s) => s.address.trim());
  const staffWithLocation = staff.filter((s) => s.active && s.location.trim());

  const rows: { staff_id: string; school_id: string; distance_miles: number }[] = [];
  const unresolvableSchoolIds: string[] = [];
  const resolvableSchoolIds: string[] = [];

  for (const school of schoolsWithAddress) {
    const missingStaff = staffWithLocation.filter((s) => !existingPairs.has(`${s.id}_${school.id}`));
    if (missingStaff.length === 0) continue;

    const results = await lookupDistancesToDestination(
      missingStaff.map((s) => s.location),
      school.address
    );

    let anyResolved = false;
    results.forEach((r, i) => {
      if (r.miles !== null) {
        anyResolved = true;
        rows.push({ staff_id: missingStaff[i].id, school_id: school.id, distance_miles: r.miles });
      }
    });
    // Google couldn't find directions to this school's address for anyone —
    // more likely a typo/bad address than every single staff location being
    // at fault, so flag it for the owner to double-check.
    if (anyResolved) resolvableSchoolIds.push(school.id);
    else unresolvableSchoolIds.push(school.id);
  }

  const supabase = await createClient();

  if (rows.length > 0) {
    const { error } = await supabase
      .from("staff_school_distances")
      .upsert(rows, { onConflict: "staff_id,school_id" });
    if (error) throw new Error("Distances were computed but couldn't be saved — please try again.");
  }

  if (unresolvableSchoolIds.length > 0) {
    await supabase.from("schools").update({ address_unresolvable: true }).in("id", unresolvableSchoolIds);
  }
  if (resolvableSchoolIds.length > 0) {
    await supabase.from("schools").update({ address_unresolvable: false }).in("id", resolvableSchoolIds);
  }

  revalidatePath("/staff");
  revalidatePath("/schedule");
  revalidatePath("/jobs");

  const unresolvableAddresses = schools
    .filter((s) => unresolvableSchoolIds.includes(s.id))
    .map((s) => s.name);

  return { computed: rows.length, skippedNoAddress, skippedNoLocation, unresolvableAddresses };
}
