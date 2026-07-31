import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { monthLabel } from "@/lib/month";

// Runs on Vercel Cron (see vercel.json, hourly) to remind any active staff
// member who hasn't submitted availability yet, once their month's deadline
// is within 24 hours. No logged-in session exists for a cron trigger, so
// this uses the service-role client the same way the Zapier import webhook
// does (src/app/api/webhooks/zapier/jobs/route.ts).
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
  const webhookUrl = process.env.ZAPIER_AVAILABILITY_REMINDER_WEBHOOK_URL;

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Deadlines that will land within the next 24 hours and haven't already
  // had their reminder batch sent. Hourly cron granularity means this fires
  // on whichever tick first sees the deadline enter that window, not at a
  // precise T-minus-24h instant.
  const { data: links, error: linksError } = await supabase
    .from("availability_links")
    .select("token, month, deadline_at")
    .not("deadline_at", "is", null)
    .gt("deadline_at", now.toISOString())
    .lte("deadline_at", in24h.toISOString())
    .is("reminder_sent_at", null);

  if (linksError) {
    return NextResponse.json({ error: "Couldn't load availability links" }, { status: 500 });
  }

  let remindersSent = 0;

  for (const link of links ?? []) {
    const [{ data: staff }, { data: submissions }] = await Promise.all([
      supabase.from("staff").select("id, name, email, pin").eq("active", true),
      supabase
        .from("availability_submissions")
        .select("staff_id")
        .eq("month", link.month),
    ]);

    const submittedIds = new Set((submissions ?? []).map((s) => s.staff_id));
    const pending = (staff ?? []).filter((s) => !submittedIds.has(s.id));

    if (webhookUrl) {
      for (const s of pending) {
        if (!s.email?.trim()) continue;
        await fetch(webhookUrl, {
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
            deadline_label: new Date(link.deadline_at as string).toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            }),
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

  return NextResponse.json({ linksProcessed: links?.length ?? 0, remindersSent, webhookConfigured: !!webhookUrl });
}
