"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const LINK_LIFETIME_DAYS = 45;

export async function createAvailabilityLink(month: string) {
  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createClient();
  const { error } = await supabase.from("availability_links").insert({
    token,
    month,
    expires_at: expiresAt,
  });

  if (error) throw new Error("Couldn't generate a link — please try again.");

  revalidatePath("/availability-tracker");
}

// Lets an owner directly toggle a staff member's availability for a Picture
// Day — for when someone lets you know about a change outside the app
// (a call, a text) rather than through their own link.
export async function setStaffAvailability(staffId: string, pictureDayId: string, available: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("availability").upsert(
    { staff_id: staffId, picture_day_id: pictureDayId, available, updated_at: new Date().toISOString() },
    { onConflict: "staff_id,picture_day_id" }
  );
  if (error) throw new Error("Couldn't update availability — please try again.");

  revalidatePath("/availability-tracker");
  revalidatePath("/schedule");
}
