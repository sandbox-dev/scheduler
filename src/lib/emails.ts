// The actual wording of every email this app sends. These used to live in
// six separate Zapier "Email by Zapier"/Gmail actions, where they couldn't be
// reviewed, version-controlled, or tested — and where a Zap being edited or
// switched off silently changed what staff received. Keeping them here means
// the email a staff member gets is the email in this file.
//
// Deliberately plain HTML with inline styles: every real-world mail client
// strips <style> blocks and external CSS, so inline is the only thing that
// survives. Matches the timeline-builder app's house look (same font stack,
// same button, same ink colour) so anything from Sandbox reads consistently.

import { firstNameOf } from "./personName";

const INK = "#20232B";
const MUTED = "#6B7280";
const WRAP = `font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${INK};`;
const BUTTON =
  "display:inline-block;padding:12px 28px;background:#3B5B6A;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;font-family:Arial,Helvetica,sans-serif;font-size:14px;";
const PIN_BOX = `display:inline-block;padding:10px 18px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:6px;font-size:22px;font-weight:700;letter-spacing:3px;color:${INK};`;

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(inner: string): string {
  return `<div style="${WRAP}">${inner}</div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="${BUTTON}">${escapeHtml(label)}</a></p>`;
}

function signOff(): string {
  return `<p style="margin:24px 0 0;color:${MUTED};font-size:13px;">— Sandbox Photographers</p>`;
}

export type AvailabilityRequestEmail = {
  staffName: string;
  monthLabel: string;
  link: string;
  pin: string;
  deadlineLabel: string | null;
  // A reopen is the same email with a line explaining why it arrived twice —
  // without it, someone who already submitted just sees a duplicate request
  // and reasonably ignores it, which defeats the whole point of reopening.
  reopened?: boolean;
};

export function availabilityRequestEmail(e: AvailabilityRequestEmail): { subject: string; htmlBody: string } {
  const subject = e.reopened
    ? `Update your ${e.monthLabel} Picture Day availability`
    : `Your ${e.monthLabel} Picture Day availability`;

  const intro = e.reopened
    ? `<p>We've reopened your <strong>${escapeHtml(e.monthLabel)}</strong> availability so you can update it. Your current dates are already ticked — just change what's different and submit again.</p>`
    : `<p>Please let us know which <strong>${escapeHtml(e.monthLabel)}</strong> Picture Days you're available for.</p>`;

  return {
    subject,
    htmlBody: wrap(
      `<p>Hi ${escapeHtml(firstNameOf(e.staffName))},</p>` +
        intro +
        button(e.link, e.reopened ? "UPDATE MY AVAILABILITY" : "SET MY AVAILABILITY") +
        `<p style="margin:0 0 6px;">Pick your name, then enter your PIN:</p>` +
        `<p style="margin:0 0 20px;"><span style="${PIN_BOX}">${escapeHtml(e.pin)}</span></p>` +
        (e.deadlineLabel
          ? `<p>Please respond by <strong>${escapeHtml(e.deadlineLabel)}</strong>.</p>`
          : `<p>Please respond as soon as you can.</p>`) +
        `<p style="color:${MUTED};font-size:13px;">This PIN is yours alone — it only ever shows or changes your own availability.</p>` +
        signOff()
    ),
  };
}

export function availabilityReminderEmail(e: {
  staffName: string;
  monthLabel: string;
  link: string;
  pin: string;
  deadlineLabel: string;
}): { subject: string; htmlBody: string } {
  return {
    subject: `Reminder: ${e.monthLabel} availability due ${e.deadlineLabel}`,
    htmlBody: wrap(
      `<p>Hi ${escapeHtml(firstNameOf(e.staffName))},</p>` +
        `<p>We haven't got your <strong>${escapeHtml(e.monthLabel)}</strong> Picture Day availability yet, and it's due <strong>${escapeHtml(e.deadlineLabel)}</strong>.</p>` +
        button(e.link, "SET MY AVAILABILITY") +
        `<p style="margin:0 0 6px;">Pick your name, then enter your PIN:</p>` +
        `<p style="margin:0 0 20px;"><span style="${PIN_BOX}">${escapeHtml(e.pin)}</span></p>` +
        `<p>It only takes a minute — thank you!</p>` +
        signOff()
    ),
  };
}

export function deadlineMissedEmail(e: {
  monthLabel: string;
  deadlineLabel: string;
  missingNames: string[];
}): { subject: string; htmlBody: string } {
  return {
    subject: `${e.missingNames.length} staff missed the ${e.monthLabel} availability deadline`,
    htmlBody: wrap(
      `<p>The <strong>${escapeHtml(e.monthLabel)}</strong> availability deadline (${escapeHtml(e.deadlineLabel)}) has passed.</p>` +
        `<p>Still waiting on ${e.missingNames.length} ${e.missingNames.length === 1 ? "person" : "people"}:</p>` +
        `<ul style="margin:0 0 16px;padding-left:20px;">${e.missingNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` +
        signOff()
    ),
  };
}

export function staffSubmittedEmail(e: {
  staffName: string;
  monthLabel: string;
  trackerLink: string;
}): { subject: string; htmlBody: string } {
  return {
    subject: `${e.staffName} submitted ${e.monthLabel} availability`,
    htmlBody: wrap(
      `<p><strong>${escapeHtml(e.staffName)}</strong> just submitted their <strong>${escapeHtml(e.monthLabel)}</strong> availability.</p>` +
        button(e.trackerLink, "SEE THEIR DATES") +
        signOff()
    ),
  };
}

export function allSubmittedEmail(e: { monthLabel: string; trackerLink: string }): { subject: string; htmlBody: string } {
  return {
    subject: `Everyone's in — ${e.monthLabel} availability complete`,
    htmlBody: wrap(
      `<p>Every active staff member has now submitted their <strong>${escapeHtml(e.monthLabel)}</strong> availability. You're clear to build the schedule.</p>` +
        button(e.trackerLink, "BUILD THE SCHEDULE") +
        signOff()
    ),
  };
}

export type ScheduleDay = { date: string; role: string; school: string; city: string };

function scheduleDaysTable(days: ScheduleDay[]): string {
  const rows = days
    .map(
      (d) =>
        `<tr>` +
        `<td style="padding:8px 14px 8px 0;white-space:nowrap;font-weight:700;">${escapeHtml(d.date)}</td>` +
        `<td style="padding:8px 14px 8px 0;white-space:nowrap;">${escapeHtml(d.role)}</td>` +
        `<td style="padding:8px 0;">${escapeHtml(d.school)}${d.city ? ` <span style="color:${MUTED};">(${escapeHtml(d.city)})</span>` : ""}</td>` +
        `</tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;margin:16px 0;font-size:15px;">${rows}</table>`;
}

export function scheduleApprovedEmail(e: {
  staffName: string;
  monthLabel: string;
  days: ScheduleDay[];
  confirmLink: string;
}): { subject: string; htmlBody: string } {
  return {
    subject: `Your ${e.monthLabel} Picture Day schedule`,
    htmlBody: wrap(
      `<p>Hi ${escapeHtml(firstNameOf(e.staffName))},</p>` +
        `<p>Your <strong>${escapeHtml(e.monthLabel)}</strong> schedule is confirmed. Here's where you're booked:</p>` +
        scheduleDaysTable(e.days) +
        `<p style="color:${MUTED};font-size:13px;">By clicking below I confirm that I have reviewed and accept the schedule above.</p>` +
        button(e.confirmLink, "CONFIRM") +
        `<p style="color:${MUTED};font-size:13px;">If anything here doesn't look right, reply to this email and let us know.</p>` +
        signOff()
    ),
  };
}

// Sent once, ~48h after the original schedule email, only to whoever hasn't
// confirmed yet — repeats the schedule inline rather than just linking back
// to the original email, since that one may already be buried. Adi,
// 2026-09-21: "please confirm you reviewed the schedule, here it is again,
// with a confirm button."
export function scheduleConfirmReminderEmail(e: {
  staffName: string;
  monthLabel: string;
  days: ScheduleDay[];
  confirmLink: string;
}): { subject: string; htmlBody: string } {
  return {
    subject: `Please confirm your ${e.monthLabel} Picture Day schedule`,
    htmlBody: wrap(
      `<p>Hi ${escapeHtml(firstNameOf(e.staffName))},</p>` +
        `<p>Just checking you've seen your <strong>${escapeHtml(e.monthLabel)}</strong> schedule — here it is again:</p>` +
        scheduleDaysTable(e.days) +
        `<p style="color:${MUTED};font-size:13px;">By clicking below I confirm that I have reviewed and accept the schedule above.</p>` +
        button(e.confirmLink, "CONFIRM") +
        signOff()
    ),
  };
}

// Studio-facing, ~72h after approving — silent if everyone's already
// confirmed by then (see the cron route for that check). Adi, 2026-09-21:
// "72 hours we get a list of who is missing."
export function scheduleConfirmationsMissingEmail(e: {
  monthLabel: string;
  missingNames: string[];
}): { subject: string; htmlBody: string } {
  return {
    subject: `${e.missingNames.length} staff haven't confirmed their ${e.monthLabel} schedule`,
    htmlBody: wrap(
      `<p>It's been 72 hours since the <strong>${escapeHtml(e.monthLabel)}</strong> schedule went out.</p>` +
        `<p>Still waiting on ${e.missingNames.length} ${e.missingNames.length === 1 ? "person" : "people"} to confirm:</p>` +
        `<ul style="margin:0 0 16px;padding-left:20px;">${e.missingNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` +
        signOff()
    ),
  };
}

// Studio-facing — fires the moment the last active staff member confirms,
// whenever that happens to land (event-driven, not on the 72h cron tick).
// Adi, 2026-09-21: "when everyone is confirmed we get an 'everyone
// confirmed' message."
export function allScheduleConfirmedEmail(e: { monthLabel: string }): { subject: string; htmlBody: string } {
  return {
    subject: `Everyone confirmed — ${e.monthLabel} schedule`,
    htmlBody: wrap(
      `<p>Every active staff member has confirmed they've reviewed the <strong>${escapeHtml(e.monthLabel)}</strong> schedule. Nothing left to chase.</p>` +
        signOff()
    ),
  };
}

// Proves the whole chain — stored connection, Google, Gmail — in one click,
// without involving a staff member. Deliberately says what it is in the
// subject so a copy sitting in the studio's inbox is never mistaken for
// something a staff member was also sent.
export function testEmail(): { subject: string; htmlBody: string } {
  return {
    subject: "Test — Picture Day Scheduler email is working",
    htmlBody: wrap(
      `<p>This is a test from the Picture Day Scheduler.</p>` +
        `<p>If you're reading it, the app can send email through your Gmail properly — availability requests, reminders and schedule emails will all go out.</p>` +
        `<p style="color:${MUTED};font-size:13px;">Nobody else received this. Test emails only ever go to the studio.</p>` +
        signOff()
    ),
  };
}
