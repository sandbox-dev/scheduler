import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { monthLabel } from "@/lib/month";

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

// Active staff for a month who don't have an availability_submissions row
// yet — shared by both the pre-deadline reminder and the post-deadline
// studio notice below.
async function getPendingStaff(supabase: SupabaseClient, month: string) {
  const [{ data: staff }, { data: submissions }] = await Promise.all([
    supabase.from("staff").select("id, name, email, pin").eq("active", true),
    supabase.from("availability_submissions").select("staff_id").eq("month", month),
  ]);
  const submittedIds = new Set((submissions ?? []).map((s) => s.staff_id));
  return (staff ?? []).filter((s) => !submittedIds.has(s.id));
}

function formatDeadline(deadlineAt: string) {
  return new Date(deadlineAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}

// Runs on Vercel Cron (see vercel.json, once daily — Vercel's free Hobby
// plan doesn't allow finer-grained schedules). Two independent jobs share
// this one route since they run on the same schedule and both key off
// availability_links.deadline_at:
//   1. Remind any active staff member who hasn't submitted yet, once their
//      month's deadline is within about a day.
//   2. Once a deadline has actually passed, tell the studio if anyone's
//      still missing (silent if everyone got their availability in).
// No logged-in session exists for a cron trigger, so this uses the
// service-role client the same way the Zapier import webhook does
// (src/app/api/webhooks/zapier/jobs/route.ts).
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>` — set the same value
// as the CRON_SECRET env var and enable Vercel Cron in the project dashboard.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const reminderWebhook = process.env.ZAPIER_AVAILABILITY_REMINDER_WEBHOOK_URL;
  const deadlineMissedWebhook = process.env.ZAPIER_DEADLINE_MISSED_WEBHOOK_URL;

  const now = new Date();
  // A bit wider than a strict 24h, since this only ticks once a day — the
  // buffer guarantees every deadline gets caught by exactly one run even if
  // that run lands a little later than the previous one did.
  const lookahead = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  let remindersSent = 0;
  let deadlineNoticesSent = 0;

  // ---------- Job 1: remind staff whose deadline is coming up ----------
  const { data: upcomingLinks, error: upcomingError } = await supabase
    .from("availability_links")
    .select("token, month, deadline_at")
    .not("deadline_at", "is", null)
    .gt("deadline_at", now.toISOString())
    .lte("deadline_at", lookahead.toISOString())
    .is("reminder_sent_at", null);

  if (upcomingError) {
    return NextResponse.json({ error: "Couldn't load upcoming-deadline links" }, { status: 500 });
  }

  for (const link of upcomingLinks ?? []) {
    const pending = await getPendingStaff(supabase, link.month);

    if (reminderWebhook) {
      for (const s of pending) {
        if (!s.email?.trim()) continue;
        await fetch(reminderWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_name: s.name,
            staff_email: s.email,
            month: link.month,
            month_label: monthLabel(link.month),
            link: `${siteUrl}/availability/${link.token}`,
            pin: s.pin,
            deadline: link.deadline_at,
            deadline_label: formatDeadline(link.deadline_at as string),
          }),
        });
        remindersSent++;
      }
    }

    // Mark the batch as sent even if the webhook isn't configured — same
    // "silently no-op without this env var" convention as every other
    // optional Zapier hookup in this app.
    await supabase
      .from("availability_links")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("token", link.token);
  }

  // ---------- Job 2: tell the studio if a deadline just passed with stragglers ----------
  const { data: passedLinks, error: passedError } = await supabase
    .from("availability_links")
    .select("token, month, deadline_at")
    .not("deadline_at", "is", null)
    .lte("deadline_at", now.toISOString())
    .is("deadline_notice_sent_at", null);

  if (passedError) {
    return NextResponse.json({ error: "Couldn't load passed-deadline links" }, { status: 500 });
  }

  for (const link of passedLinks ?? []) {
    const pending = await getPendingStaff(supabase, link.month);

    if (pending.length > 0 && deadlineMissedWebhook) {
      await fetch(deadlineMissedWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: link.month,
          month_label: monthLabel(link.month),
          deadline_label: formatDeadline(link.deadline_at as string),
          missing_count: pending.length,
          missing_names: pending.map((s) => s.name).join(", "),
        }),
      });
      deadlineNoticesSent++;
    }

    // Marked regardless of whether anyone was missing or the webhook is
    // configured — once a deadline has passed there's nothing more to check
    // for that link either way.
    await supabase
      .from("availability_links")
      .update({ deadline_notice_sent_at: new Date().toISOString() })
      .eq("token", link.token);
  }

  return NextResponse.json({
    upcomingLinksProcessed: upcomingLinks?.length ?? 0,
    remindersSent,
    reminderWebhookConfigured: !!reminderWebhook,
    passedLinksProcessed: passedLinks?.length ?? 0,
    deadlineNoticesSent,
    deadlineMissedWebhookConfigured: !!deadlineMissedWebhook,
  });
}
