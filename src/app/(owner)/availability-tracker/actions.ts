"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveAvailabilityLinkForMonth, getJobs, getStaff } from "@/lib/data";
import { flattenJobDays } from "@/lib/scheduling";
import { monthLabel } from "@/lib/month";
import { parseIcsEvents, reconcile, isSchoolPictureDayEvent, type ReconciliationResult } from "@/lib/pixifi";
import { postWebhook } from "@/lib/webhook";
import { linkHasBeenSent, mergeAskedStaffIds } from "@/lib/availability";

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
  // deadline. The deadline itself is still shared by the whole link, not
  // per-person, so a changed deadline re-arms the reminder/notice check for
  // every CURRENT recipient — but staff_ids records exactly who has been
  // asked this month (null = everyone active), so the reminder cron can tell
  // "was sent this request and hasn't answered" apart from "just happens to
  // have no submission row for this month" (real incident, 2026-08-14: a
  // narrow send to two new trainees caused the whole rest of the already-
  // submitted staff list to get reminded too).
  //
  // staff_ids ACCUMULATES across sends rather than being replaced — see
  // mergeAskedStaffIds. Overwriting it meant a follow-up send to one
  // late-added person silently removed everyone else still outstanding from
  // both the 24h reminder and the deadline-missed notice, with nothing on
  // screen to show it had happened (Adi caught this 2026-08-24 while asking
  // whether a one-person send was safe mid-month — it wasn't).
  const { data: existingLink } = await supabase
    .from("availability_links")
    .select("staff_ids, deadline_at")
    .eq("token", token)
    .maybeSingle();
  const askedStaffIds = mergeAskedStaffIds(
    (existingLink?.staff_ids as string[] | null) ?? null,
    linkHasBeenSent(existingLink as { deadline_at: string | null } | null),
    staffIds
  );

  await supabase
    .from("availability_links")
    .update({ deadline_at: deadlineAt, reminder_sent_at: null, deadline_notice_sent_at: null, staff_ids: askedStaffIds })
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
      const ok = await postWebhook("availability-request", webhookUrl!, {
        staff_name: s.name,
        staff_email: s.email,
        month,
        month_label: monthLabel(month),
        link: linkUrl,
        pin: s.pin,
        deadline: deadlineAt,
        deadline_label: deadlineLabel,
      });
      if (ok) {
        sent++;
        sentToNames.push(s.name);
      }
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

export type PixifiCheckResult = { configured: false } | ({ configured: true } & ReconciliationResult);

// Manual "Check Pixifi" button on the tracker page — fetches Pixifi's own
// direct ICS calendar feed and cross-references it against this month's
// Jobs/Picture Days by date + fuzzy school-name match, so a booking
// mismatch (canceled in one system, missing from the other) surfaces
// in-app right before sending the availability request, rather than an
// automated cron job Adi could go months without noticing had broken.
export async function checkPixifiReconciliation(month: string): Promise<PixifiCheckResult> {
  const feedUrl = process.env.PIXIFI_ICS_FEED_URL;
  if (!feedUrl) return { configured: false };

  const res = await fetch(feedUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Pixifi feed request failed (${res.status})`);
  const icsText = await res.text();

  const monthPrefix = month.slice(0, 7); // "YYYY-MM"
  const pixifiEvents = parseIcsEvents(icsText)
    .filter((e) => e.date.startsWith(monthPrefix))
    .filter(isSchoolPictureDayEvent);

  const jobs = await getJobs();
  const schedulerDays = flattenJobDays(jobs)
    .filter((jd) => jd.date.startsWith(monthPrefix))
    .map((jd) => ({ date: jd.date, school: jd.client || jd.jobName }));

  return { configured: true, ...reconcile(pixifiEvents, schedulerDays) };
}

export type ReopenResult = {
  staffName: string;
  emailed: boolean;
  reason?: "no_webhook" | "no_email" | "no_link" | "send_failed";
  deadlineLabel: string | null;
};

// Undoes one staff member's submit-and-lock for a month so they can answer
// again through the same link, and emails just them a fresh copy of it.
//
// Sending the link again on its own does nothing for someone who's already
// submitted — not even a newly generated one, since the lock lives on
// (staff, month) in availability_submissions, not on the token. Before this
// existed, a staff member whose availability changed after submitting had
// to email the studio and have an owner re-tick their dates by hand.
//
// Their existing answers are deliberately left in place: unlock_staff_
// availability returns them, so the form comes up with the dates they'd
// already picked still checked and their note intact, and they only change
// what actually moved rather than rebuilding the whole month from memory.
//
// Deliberately does NOT touch the availability_links row — unlike
// sendAvailabilityRequests, which sets deadline_at/staff_ids and re-arms
// the reminder flags. Narrowing staff_ids to this one person would scope
// the reminder cron's idea of "was asked" down to them alone and silently
// drop everyone else still pending (the mirror image of the 2026-08-14
// incident). One person being reopened is not a new request cycle.
export async function reopenStaffAvailability(month: string, staffId: string): Promise<ReopenResult> {
  const supabase = await createClient();

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("name, email, pin")
    .eq("id", staffId)
    .single();
  if (staffError || !staffRow) throw new Error("Couldn't find that staff member — please refresh and try again.");
  const staffName = staffRow.name as string;

  const { error: unlockError } = await supabase
    .from("availability_submissions")
    .delete()
    .eq("staff_id", staffId)
    .eq("month", month);
  if (unlockError) throw new Error("Couldn't reopen their availability — please try again.");

  revalidatePath("/availability-tracker");

  const link = await getActiveAvailabilityLinkForMonth(month);
  const deadlineLabel = link?.deadline_at
    ? new Date(link.deadline_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })
    : null;

  // Everything below is the email. The unlock above has already happened and
  // stands on its own — if the email can't go out, say which reason rather
  // than failing the whole action, so the owner knows to text them the link
  // instead of being left unsure whether they were reopened at all.
  const webhookUrl = process.env.ZAPIER_AVAILABILITY_WEBHOOK_URL;
  if (!webhookUrl) return { staffName, emailed: false, reason: "no_webhook", deadlineLabel };
  if (!link) return { staffName, emailed: false, reason: "no_link", deadlineLabel };
  if (!String(staffRow.email ?? "").trim()) return { staffName, emailed: false, reason: "no_email", deadlineLabel };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // Reuses the existing "Send availability request" Zap rather than needing
  // a new one set up — same payload shape, so the same email template just
  // goes out again to one person.
  const ok = await postWebhook("availability-request", webhookUrl, {
    staff_name: staffName,
    staff_email: staffRow.email,
    month,
    month_label: monthLabel(month),
    link: `${siteUrl}/availability/${link.token}`,
    pin: staffRow.pin,
    deadline: link.deadline_at ?? "",
    deadline_label: deadlineLabel ?? "as soon as possible",
  });
  if (!ok) return { staffName, emailed: false, reason: "send_failed", deadlineLabel };

  // Logged the same way a normal send is, so the "Already sent this month"
  // panel shows a reopen alongside the original request instead of an email
  // going out with no trace of it on the page.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("availability_send_log").insert({
    month,
    sent_by: user?.email || "unknown",
    recipient_names: [`${staffName} (reopened)`],
  });
  revalidatePath("/availability-tracker");

  return { staffName, emailed: true, deadlineLabel };
}
