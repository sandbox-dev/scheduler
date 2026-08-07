"use server";

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
  if (result.ok) notifyOwners(result).catch((err) => console.error("notifyOwners failed", err));
  return result;
}

// Lets the studio know a staff member has responded, and separately flags
// once everyone active has — same fire-and-forget Zapier-webhook pattern as
// every other notification in this app. A webhook failure here should never
// block the staff member's own "submitted" confirmation screen.
async function notifyOwners(result: SubmitResult) {
  const month = result.month!;
  const monthLbl = monthLabel(month);

  const submittedWebhook = process.env.ZAPIER_STAFF_SUBMITTED_WEBHOOK_URL;
  if (submittedWebhook) {
    await postWebhook("staff-submitted", submittedWebhook, { staff_name: result.staff_name, month, month_label: monthLbl });
  }

  const allSubmittedWebhook = process.env.ZAPIER_ALL_SUBMITTED_WEBHOOK_URL;
  if (result.all_submitted && allSubmittedWebhook) {
    await postWebhook("all-submitted", allSubmittedWebhook, { month, month_label: monthLbl });
  }
}
