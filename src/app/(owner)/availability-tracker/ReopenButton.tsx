"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { reopenStaffAvailability, type ReopenResult } from "./actions";

const REASON_TEXT: Record<NonNullable<ReopenResult["reason"]>, string> = {
  no_webhook: "but no email was sent — email sending isn't set up yet. Send them the link yourself.",
  no_link: "but no email was sent — there's no active link for this month. Generate one, then send it to them.",
  no_email: "but no email was sent — there's no email address on file for them. Add one on the Staff page, or text them the link.",
  send_failed: "but the email didn't go through. Copy the link at the top of this page and send it to them yourself.",
};

// Per-person "let them answer again" control on the Response Tracker. Only
// rendered for someone who's actually submitted — for anyone still pending,
// the link they already have works as-is and this would be a no-op.
export function ReopenButton({
  month,
  monthLabel,
  staffId,
  staffName,
}: {
  month: string;
  monthLabel: string;
  staffId: string;
  staffName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function handleReopen() {
    // Sends a real email the moment it's confirmed, with no way to unsend —
    // the same rule every other real-effect action in this app follows
    // (Adi's standing ask after a live request went out during testing).
    const confirmed = confirm(
      `Let ${staffName} redo their ${monthLabel} availability?\n\n` +
        `They'll get an email with the link and their PIN, and the form will come up with their current dates already ticked so they only change what's different.\n\n` +
        `This sends a real email and can't be undone. Continue?`
    );
    if (!confirmed) return;

    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await reopenStaffAvailability(month, staffId);
        setResult(
          outcome.emailed
            ? {
                ok: true,
                text:
                  `${outcome.staffName} can answer again — emailed them the link and their PIN.` +
                  (outcome.deadlineLabel ? ` Respond by ${outcome.deadlineLabel}.` : ""),
              }
            : { ok: false, text: `${outcome.staffName} can answer again, ${REASON_TEXT[outcome.reason!]}` }
        );
      } catch {
        setResult({ ok: false, text: "Couldn't reopen their availability — please try again." });
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        className="btn-secondary"
        style={{ fontSize: 11.5, padding: "4px 9px" }}
        title={`Unlocks ${staffName}'s ${monthLabel} availability so they can change it themselves, and emails them the link again. Asks you to confirm first — this sends real email.`}
        disabled={pending}
        onClick={handleReopen}
      >
        <RotateCcw size={12} /> {pending ? "Reopening…" : "Reopen"}
      </button>

      {result && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 5,
            fontSize: 11.5,
            fontWeight: 600,
            lineHeight: 1.35,
            color: result.ok ? "var(--good)" : "var(--navy)",
            background: result.ok ? "rgba(30,138,98,0.09)" : "var(--gold-tint)",
            border: `1px solid ${result.ok ? "rgba(30,138,98,0.35)" : "var(--gold)"}`,
            borderRadius: 8,
            padding: "7px 9px",
            marginTop: 6,
            maxWidth: 260,
          }}
        >
          {result.ok ? <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
}
