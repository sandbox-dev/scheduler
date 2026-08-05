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
// so each person only ever needs their own PIN, not the group's. Also
// records the "respond by" deadline the owner just set on the link, which
// the 24h-before reminder cron job reads to know when to nudge stragglers.
export async function sendAvailabilityRequests(
  month: string,
  linkUrl: string,
  deadlineAt: string,
  staffIds?: string[]
): Promise<SendAvailabilityRequestsResult> {
  const token = linkUrl.split("/").pop()!;
  const supabase = await createClient();
  // Clearing reminder_sent_at / deadline_notice_sent_at handles a re-send
  // with a pushed-out deadline — otherwise the old deadline's reminder or
  // studio notice having already fired would silently block one for the new
  // deadline. This resets for everyone on the link even when staffIds only
  // targets a subset — the deadline itself is shared by the whole link, not
  // per-person, so a changed deadline should re-arm the reminder/notice
  // check for every recipient, not just whoever this particular send targets.
  await supabase
    .from("availability_links")
    .update({ deadline_at: deadlineAt, reminder_sent_at: null, deadline_notice_sent_at: null })
    .eq("token", token);
  revalidatePath("/availability-tracker");

  const webhookUrl = process.env.ZAPIER_AVAILABILITY_WEBHOOK_URL;
  const webhookConfigured = !!webhookUrl;

  // staffIds narrows to specific people (e.g. a staff member added mid-month,
  // or re-flagging a last-minute date to a few people) — omit it to send to
  // everyone active, same as before this option existed.
  const targetIds = staffIds ? new Set(staffIds) : null;
  const staff = (await getStaff()).filter((s) => !targetIds || targetIds.has(s.id));
  const skippedNoEmail: string[] = [];
  const sentToNames: string[] = [];
  let sent = 0;
  const deadlineLabel = new Date(deadlineAt).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });

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
          deadline: deadlineAt,
          deadline_label: deadlineLabel,
        }),
      });
      sent++;
      sentToNames.push(s.name);
    }

    // Logged so a second owner login (Adi/Julia/Steph all share full owner
    // access with no other way to tell) can see this month's request has
    // already gone out before sending it again. Append-only on purpose — a
    // follow-up send to a few specific people stays visible as its own row
    // alongside the original send-to-everyone, not merged/overwritten.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("availability_send_log").insert({
      month,
      sent_by: user?.email || "unknown",
      recipient_names: sentToNames,
    });
    revalidatePath("/availability-tracker");
  }

  return { sent, skippedNoEmail, webhookConfigured };
}
