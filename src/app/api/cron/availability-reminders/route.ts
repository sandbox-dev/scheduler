import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { monthLabel } from "@/lib/month";
import { sendGmailMessage } from "@/lib/gmail";
import {
  availabilityReminderEmail,
  deadlineMissedEmail,
  scheduleConfirmReminderEmail,
  scheduleConfirmationsMissingEmail,
} from "@/lib/emails";
import { buildStaffScheduleRows, cityFromAddress, fmtDate, neededDatesSummary } from "@/lib/scheduling";
import type { JobWithDays, ScheduleAssignment } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

// Active staff (optionally narrowed to a specific link's staff_ids — see
// schema.sql's comment on availability_links.staff_ids) who don't have an
// availability_submissions row yet — shared by both the pre-deadline
// reminder and the post-deadline studio notice below.
//
// staffIds narrows "pending" to "was actually sent this link's current
// request." Without it, every active staff member with no submission row
// for `month` counts as pending, regardless of whether they were ever asked
// — which is exactly the bug behind a real incident (2026-08-14): a narrow
// send to two new trainees reminded the whole rest of an already-submitted
// staff list, since nothing scoped "pending" to "this specific request."
async function getPendingStaff(supabase: SupabaseClient, month: string, staffIds: string[] | null) {
  let staffQuery = supabase.from("staff").select("id, name, email, pin").eq("active", true);
  if (staffIds) staffQuery = staffQuery.in("id", staffIds);

  const [{ data: staff }, { data: submissions }] = await Promise.all([
    staffQuery,
    supabase.from("availability_submissions").select("staff_id").eq("month", month),
  ]);
  const submittedIds = new Set((submissions ?? []).map((s) => s.staff_id));
  return (staff ?? []).filter((s) => !submittedIds.has(s.id));
}

const STUDIO_EMAIL = "hello@sandboxphotographers.com";

function formatDeadline(deadlineAt: string) {
  return new Date(deadlineAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
}

// Runs on Vercel Cron (see vercel.json, once daily — Vercel's free Hobby
// plan doesn't allow finer-grained schedules). Four independent jobs share
// this one route since they all run on the same daily schedule:
//   1. Remind any active staff member who hasn't submitted availability
//      yet, once their month's deadline is within about a day.
//   2. Once an availability deadline has actually passed, tell the studio
//      if anyone's still missing (silent if everyone got it in).
//   3. Remind any staff member who hasn't confirmed they reviewed their
//      approved schedule yet, once ~48h have passed since it was sent.
//   4. Once ~72h have passed since a schedule was approved, tell the studio
//      who still hasn't confirmed (silent if everyone already has).
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

  const now = new Date();
  // A bit wider than a strict 24h, since this only ticks once a day — the
  // buffer guarantees every deadline gets caught by exactly one run even if
  // that run lands a little later than the previous one did.
  const lookahead = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  let remindersSent = 0;
  const remindersFailed: string[] = [];
  let deadlineNoticesSent = 0;

  // ---------- Job 1: remind staff whose deadline is coming up ----------
  const { data: upcomingLinks, error: upcomingError } = await supabase
    .from("availability_links")
    .select("token, month, deadline_at, staff_ids")
    .not("deadline_at", "is", null)
    .gt("deadline_at", now.toISOString())
    .lte("deadline_at", lookahead.toISOString())
    .is("reminder_sent_at", null);

  if (upcomingError) {
    return NextResponse.json({ error: "Couldn't load upcoming-deadline links" }, { status: 500 });
  }

  for (const link of upcomingLinks ?? []) {
    const pending = await getPendingStaff(supabase, link.month, link.staff_ids);

    for (const s of pending) {
      if (!s.email?.trim()) continue;
      const { subject, htmlBody } = availabilityReminderEmail({
        staffName: s.name,
        monthLabel: monthLabel(link.month),
        link: `${siteUrl}/availability/${link.token}`,
        pin: s.pin,
        deadlineLabel: formatDeadline(link.deadline_at as string),
      });
      const result = await sendGmailMessage({ to: s.email, subject, htmlBody });
      if (result.ok) remindersSent++;
      else remindersFailed.push(s.name);
    }

    // Marked regardless of whether every individual send succeeded — this is
    // a once-daily job, and re-arming it would re-remind everyone who DID get
    // theirs. Failures are surfaced in the response body instead (and logged
    // by sendGmailMessage) rather than retried blindly.
    await supabase
      .from("availability_links")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("token", link.token);
  }

  // ---------- Job 2: tell the studio if a deadline just passed with stragglers ----------
  const { data: passedLinks, error: passedError } = await supabase
    .from("availability_links")
    .select("token, month, deadline_at, staff_ids")
    .not("deadline_at", "is", null)
    .lte("deadline_at", now.toISOString())
    .is("deadline_notice_sent_at", null);

  if (passedError) {
    return NextResponse.json({ error: "Couldn't load passed-deadline links" }, { status: 500 });
  }

  for (const link of passedLinks ?? []) {
    const pending = await getPendingStaff(supabase, link.month, link.staff_ids);

    if (pending.length > 0) {
      const { subject, htmlBody } = deadlineMissedEmail({
        monthLabel: monthLabel(link.month),
        deadlineLabel: formatDeadline(link.deadline_at as string),
        missingNames: pending.map((s) => s.name),
      });
      const result = await sendGmailMessage({ to: STUDIO_EMAIL, subject, htmlBody });
      if (result.ok) deadlineNoticesSent++;
    }

    // Marked regardless of whether anyone was missing — once a deadline has
    // passed there's nothing more to check for that link either way.
    await supabase
      .from("availability_links")
      .update({ deadline_notice_sent_at: new Date().toISOString() })
      .eq("token", link.token);
  }

  // ---------- Job 3: remind staff who haven't confirmed their schedule ----------
  let confirmRemindersSent = 0;
  const confirmRemindersFailed: string[] = [];
  const confirmReminderCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const { data: dueConfirmations, error: dueConfirmError } = await supabase
    .from("schedule_confirmations")
    .select("token, month, staff_id")
    .lte("sent_at", confirmReminderCutoff.toISOString())
    .is("confirmed_at", null)
    .is("reminder_sent_at", null);

  if (dueConfirmError) {
    return NextResponse.json({ error: "Couldn't load due schedule confirmations" }, { status: 500 });
  }

  // Grouped by month so each month's schedule rows are only rebuilt once,
  // even if several staff members are due a reminder for the same month.
  const monthsNeeded = [...new Set((dueConfirmations ?? []).map((c) => c.month as string))];
  const rowsByMonth = new Map<string, Awaited<ReturnType<typeof buildScheduleRowsForMonth>>>();
  for (const m of monthsNeeded) {
    rowsByMonth.set(m, await buildScheduleRowsForMonth(supabase, m));
  }

  // Active only — an inactive/departed staff member should never get a
  // reminder, and their stale unconfirmed row (if any) shouldn't show up
  // in the studio's "still missing" list either, matching the active-only
  // definition confirm_schedule's own all_confirmed check already uses.
  const { data: activeStaffForConfirm } = await supabase.from("staff").select("id, name, email").eq("active", true);
  const staffById = new Map((activeStaffForConfirm ?? []).map((s) => [s.id as string, s]));

  for (const c of dueConfirmations ?? []) {
    const s = staffById.get(c.staff_id as string);
    const rows = rowsByMonth.get(c.month as string)?.get(c.staff_id as string) ?? [];
    if (s?.email?.trim() && rows.length > 0) {
      const { subject, htmlBody } = scheduleConfirmReminderEmail({
        staffName: s.name,
        monthLabel: monthLabel(c.month as string),
        days: rows,
        confirmLink: `${siteUrl}/confirm-schedule/${c.token}`,
      });
      const result = await sendGmailMessage({ to: s.email, subject, htmlBody });
      if (result.ok) confirmRemindersSent++;
      else confirmRemindersFailed.push(s.name);
    }

    // Marked regardless of send outcome, same reasoning as Job 1 — a
    // once-daily job shouldn't re-remind everyone who already got theirs
    // just because one person's send failed.
    await supabase
      .from("schedule_confirmations")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("token", c.token);
  }

  // ---------- Job 4: tell the studio who's still missing, 72h after approving ----------
  let missingNoticesSent = 0;
  const confirmMissingCutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000);

  const { data: duePayApprovals, error: dueApprovalError } = await supabase
    .from("schedule_approvals")
    .select("month, approved_at")
    .lte("approved_at", confirmMissingCutoff.toISOString())
    .is("missing_confirmations_notice_sent_at", null);

  if (dueApprovalError) {
    return NextResponse.json({ error: "Couldn't load due schedule approvals" }, { status: 500 });
  }

  for (const approval of duePayApprovals ?? []) {
    const { data: confirmations } = await supabase
      .from("schedule_confirmations")
      .select("staff_id, confirmed_at")
      .eq("month", approval.month);

    const missingIds = (confirmations ?? []).filter((c) => !c.confirmed_at).map((c) => c.staff_id as string);
    const missingActiveNames = missingIds
      .map((id) => staffById.get(id))
      .filter((s): s is { id: string; name: string; email: string } => Boolean(s));

    if (missingActiveNames.length > 0) {
      const { subject, htmlBody } = scheduleConfirmationsMissingEmail({
        monthLabel: monthLabel(approval.month as string),
        missingNames: missingActiveNames.map((s) => s.name),
      });
      const result = await sendGmailMessage({ to: STUDIO_EMAIL, subject, htmlBody });
      if (result.ok) missingNoticesSent++;
    }

    // Marked regardless of whether anyone was missing — this notice only
    // ever fires once per approval, same as deadline_notice_sent_at above.
    await supabase
      .from("schedule_approvals")
      .update({ missing_confirmations_notice_sent_at: new Date().toISOString() })
      .eq("month", approval.month);
  }

  return NextResponse.json({
    upcomingLinksProcessed: upcomingLinks?.length ?? 0,
    remindersSent,
    remindersFailed,
    passedLinksProcessed: passedLinks?.length ?? 0,
    deadlineNoticesSent,
    dueConfirmationsProcessed: dueConfirmations?.length ?? 0,
    confirmRemindersSent,
    confirmRemindersFailed,
    dueApprovalsProcessed: duePayApprovals?.length ?? 0,
    missingNoticesSent,
  });
}

// Rebuilds every active staff member's booked days for `month`, same shape
// approveSchedule's own send loop builds — needed again here since the 48h
// reminder repeats the schedule inline rather than just linking back to an
// email that may already be buried. Fetched fresh each run, never cached,
// so a schedule edited after approval is reflected in the reminder too.
async function buildScheduleRowsForMonth(supabase: SupabaseClient, month: string) {
  const [{ data: jobs }, { data: assignments }, { data: schools }] = await Promise.all([
    supabase.from("jobs").select("*, picture_days(*)"),
    supabase.from("schedule_assignments").select("*"),
    supabase.from("schools").select("*"),
  ]);

  const jobsWithDays = (jobs as JobWithDays[] | null ?? []).map((j) => ({
    ...j,
    picture_days: [...j.picture_days].sort((a, b) => a.date.localeCompare(b.date)),
  }));
  const typedAssignments = (assignments as ScheduleAssignment[] | null) ?? [];

  const needed = neededDatesSummary(jobsWithDays).filter((n) => n.date.startsWith(month.slice(0, 7)));
  const assignmentsByDay = new Map<string, ScheduleAssignment[]>();
  typedAssignments.forEach((a) => {
    const list = assignmentsByDay.get(a.picture_day_id) || [];
    list.push(a);
    assignmentsByDay.set(a.picture_day_id, list);
  });
  const schoolAddressById = new Map((schools ?? []).map((s) => [s.id as string, s.address as string]));
  const rowsByStaffId = buildStaffScheduleRows(needed, assignmentsByDay, schoolAddressById);

  const formatted = new Map<string, { date: string; role: string; school: string; city: string }[]>();
  for (const [staffId, rows] of rowsByStaffId) {
    formatted.set(
      staffId,
      rows.map((r) => {
        const { wd, md } = fmtDate(r.date);
        return { date: `${wd} ${md}`, role: r.role, school: r.jobName, city: cityFromAddress(r.address) };
      })
    );
  }
  return formatted;
}
