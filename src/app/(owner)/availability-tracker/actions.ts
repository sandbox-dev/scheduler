"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/data";
import { monthLabel } from "@/lib/month";

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

export type SendAvailabilityRequestsResult = { sent: number; skippedNoEmail: string[]; webhookConfigured: boolean };

// One click instead of texting/emailing everyone individually — fires one
// notification per active staff member (via a Zapier webhook, same pattern
// as the schedule-approval emails) with the shared link plus their own PIN,
// so each person only ever needs their own PIN, not the group's.
export async function sendAvailabilityRequests(month: string, linkUrl: string): Promise<SendAvailabilityRequestsResult> {
  const webhookUrl = process.env.ZAPIER_AVAILABILITY_WEBHOOK_URL;
  const webhookConfigured = !!webhookUrl;

  const staff = await getStaff();
  const skippedNoEmail: string[] = [];
  let sent = 0;

  if (webhookConfigured) {
    for (const s of staff) {
      if (!s.active) continue;
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
          link: linkUrl,
          pin: s.pin,
        }),
      });
      sent++;
    }
  }

  return { sent, skippedNoEmail, webhookConfigured };
}
