"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/month";
import { sendGmailMessage } from "@/lib/gmail";
import { allScheduleConfirmedEmail } from "@/lib/emails";

// The studio's own inbox — same address every other owner-facing "the app
// is telling you something happened" email in this app uses.
const STUDIO_EMAIL = "hello@sandboxphotographers.com";

export type ConfirmResult = { error?: string; ok?: boolean; staff_name?: string; month?: string; all_confirmed?: boolean };

export async function confirmSchedule(token: string): Promise<ConfirmResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_schedule", { p_token: token });
  if (error) return { error: "invalid_link" };

  const result = data as ConfirmResult;
  // Same after()-not-fire-and-forget reasoning as availability's
  // notifyOwners: this Server Action's own execution can be frozen once its
  // response is sent, so a bare unawaited call risks the email silently
  // never going out (root-caused a real missing-notification incident
  // 2026-08-07 on the availability side — see reference memory).
  if (result.ok && result.all_confirmed) {
    after(() => notifyAllConfirmed(result.month!).catch((err) => console.error("notifyAllConfirmed failed", err)));
  }
  return result;
}

async function notifyAllConfirmed(month: string) {
  const { subject, htmlBody } = allScheduleConfirmedEmail({ monthLabel: monthLabel(month) });
  await sendGmailMessage({ to: STUDIO_EMAIL, subject, htmlBody });
}
