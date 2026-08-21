"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/month";
import { postWebhook } from "@/lib/webhook";

export type UnlockResult = { error?: string; existing?: string[]; note?: string };

export async function unlockStaffAvailability(token: string, staffId: string, pin: string): Promise<UnlockResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unlock_staff_availability", {
    p_token: token,
    p_staff_id: staffId,
    p_pin: pin,
  });
  if (error) return { error: "invalid_or_expired_link" };
  return data as UnlockResult;
}

export type SubmitResult = {
  error?: string;
  ok?: boolean;
  staff_name?: string;
  month?: string;
  all_submitted?: boolean;
};

export async function submitAvailabilityFinal(
  token: string,
  staffId: string,
  pin: string,
  availableDayIds: string[],
  note: string
): Promise<SubmitResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_availability_final", {
    p_token: token,
    p_staff_id: staffId,
    p_pin: pin,
    p_available_day_ids: availableDayIds,
    p_note: note,
  });
  if (error) return { error: "invalid_or_expired_link" };

  const result = data as SubmitResult;
  if (result.ok) {
    after(() => notifyOwners(result, staffId).catch((err) => console.error("notifyOwners failed", err)));
  }
  return result;
}

// Lets the studio know a staff member has responded, and separately flags
// once everyone active has. Runs via next/server's `after()` rather than a
// bare un-awaited call: on Vercel, once this Server Action's response is
// sent, the function's execution can be frozen/recycled, and a truly
// fire-and-forget promise has no guarantee its in-flight fetch() ever
// finishes — `after()` uses Vercel's waitUntil() to keep the invocation
// alive until this completes, without making the staff member's own
// "submitted" screen wait on it. Suspected root cause of the 2026-08-07
// staff-submitted notifications going missing (see memory) after every more
// obvious cause was ruled out.
async function notifyOwners(result: SubmitResult, staffId: string) {
  const month = result.month!;
  const monthLbl = monthLabel(month);
  // Straight to this month's tracker instead of the studio having to open
  // the app and pick the month by hand (Adi, scheduler backlog #1) — the
  // tracker page already reads ?month= (MonthPicker), so this is a real
  // one-click deep link, not just the app's homepage. The #staff-<id>
  // fragment (scheduler backlog #1, extended) also scrolls straight to
  // and highlights this specific person's row (see globals.css's
  // `tr.staff-row:target` rule) instead of landing on the tracker and
  // making Adi scan the whole table for who just submitted.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const trackerLink = `${siteUrl}/availability-tracker?month=${month}#staff-${staffId}`;

  const submittedWebhook = process.env.ZAPIER_STAFF_SUBMITTED_WEBHOOK_URL;
  if (submittedWebhook) {
    await postWebhook("staff-submitted", submittedWebhook, { staff_name: result.staff_name, month, month_label: monthLbl, link: trackerLink });
  }

  const allSubmittedWebhook = process.env.ZAPIER_ALL_SUBMITTED_WEBHOOK_URL;
  if (result.all_submitted && allSubmittedWebhook) {
    await postWebhook("all-submitted", allSubmittedWebhook, { month, month_label: monthLbl });
  }
}
