"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendGmailMessage } from "@/lib/gmail";
import { missingShootNotes, YES_NO_QUESTIONS, OTHER_QUESTION, NEXT_TIME_QUESTION, type ShootNotesAnswers } from "@/lib/shootNotes";

const STUDIO_EMAIL = "hello@sandboxphotographers.com";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}

export type SubmitShootNotesResult = { ok: true } | { error: string };

export async function submitShootNotes(pictureDayId: string, a: ShootNotesAnswers): Promise<SubmitShootNotesResult> {
  const missing = missingShootNotes(a);
  if (missing.length) return { error: `Please answer: ${missing.join(", ")}.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_submit_shoot_notes", {
    p_picture_day_id: pictureDayId,
    p_filled_by: a.filled_by,
    p_individual_as_expected: a.individual_as_expected,
    p_individual_note: a.individual_as_expected ? "" : a.individual_note,
    p_on_time: a.on_time,
    p_timeline_note: a.on_time ? "" : a.timeline_note,
    p_parking_as_described: a.parking_as_described,
    p_parking_note: a.parking_as_described ? "" : a.parking_note,
    p_group_as_expected: a.group_as_expected,
    p_group_note: a.group_as_expected ? "" : a.group_note,
    p_other_notes: a.other_notes,
    p_next_time: a.next_time,
  });
  if (error) return { error: "Couldn't save — please try again." };
  const result = data as { ok?: true; error?: string };
  if (result.error === "already_submitted") return { error: "Someone on your team already sent the Shoot Notes for this day." };
  if (!result.ok) return { error: "Couldn't save — please try again." };

  // Let the studio know. A failed email never undoes the submission.
  try {
    await notifyStudio(pictureDayId, a);
  } catch (err) {
    console.error("Shoot Notes studio email failed", err);
  }
  revalidatePath("/team");
  return { ok: true };
}

async function notifyStudio(pictureDayId: string, a: ShootNotesAnswers) {
  const admin = createServiceRoleClient();
  const { data: pd } = await admin.from("picture_days").select("date, job_id, jobs(name)").eq("id", pictureDayId).maybeSingle();
  const job = (Array.isArray(pd?.jobs) ? pd?.jobs[0] : pd?.jobs) as { name?: string } | null | undefined;
  const { data: tb } = pd ? await admin.from("tb_jobs").select("id").eq("scheduler_job_id", pd.job_id).maybeSingle() : { data: null };
  const hub = (process.env.NEXT_PUBLIC_TIMELINE_BUILDER_URL || "https://hub.sandboxphotographers.com").replace(/\/$/, "");
  const link = tb?.id ? `${hub}/jobs/${tb.id}/details#shoot-notes` : null;
  const date = pd?.date ? new Date(`${pd.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
  const name = job?.name ?? "A picture day";

  const noteFor = (key: string) => String(a[key as keyof ShootNotesAnswers] ?? "");
  const rows = YES_NO_QUESTIONS.map((q) => {
    const yes = a[q.key];
    return `<p style="margin:0 0 10px;"><strong>${esc(q.question)}</strong><br>${yes ? "Yes" : `<span style="color:#A3342D;font-weight:700;">No</span> — ${esc(noteFor(q.noteKey))}`}</p>`;
  }).join("");
  const extra =
    (a.other_notes.trim() ? `<p style="margin:0 0 10px;"><strong>${OTHER_QUESTION}</strong><br>${esc(a.other_notes.trim())}</p>` : "") +
    (a.next_time.trim() ? `<p style="margin:0 0 10px;"><strong>${NEXT_TIME_QUESTION}</strong><br>${esc(a.next_time.trim())}</p>` : "");
  const button = link
    ? `<p style="margin:22px 0 0;"><a href="${link}" style="display:inline-block;background:#3D5A6C;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px;">REVIEW SHOOT NOTES</a></p>`
    : "";

  await sendGmailMessage({
    to: STUDIO_EMAIL,
    subject: `Shoot Notes in for ${name}${date ? ` (${date})` : ""}`,
    htmlBody: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#20232B;">
<p style="margin:0 0 14px;"><strong>${esc(name)}</strong>${date ? ` — ${esc(date)}` : ""}. Filled out by ${esc(a.filled_by.join(", "))}.</p>
${rows}${extra}${button}
<p style="margin:24px 0 0;color:#6B7280;font-size:13px;">— Sandbox Photographers</p></div>`,
  });
}
