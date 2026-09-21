"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { approveSchedule } from "./actions";
import type { ScheduleApprovalSendLogEntry } from "@/lib/data";

export function ApproveButton({
  month,
  approvedAt,
  targetNames,
  sendLog,
}: {
  month: string;
  approvedAt: string | null;
  // Everyone who'll actually get an email if this is clicked right now
  // (staff with an assignment that month) — named up front in the confirm
  // dialog rather than only found out after the fact, same guard already
  // built for the availability-request send (Adi hit a real "can we
  // unsend???" incident there).
  targetNames: string[];
  sendLog: ScheduleApprovalSendLogEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const namesLabel = targetNames.length > 0 ? targetNames.join(", ") : "nobody — no one has an assignment yet this month";
    const confirmed = confirm(
      `${approvedAt ? "Re-approve and email" : "Approve this month and email"} their schedule to: ${namesLabel}?\n\nThis sends real emails right away and can't be undone. Continue?`
    );
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await approveSchedule(month);
        // Names anyone who didn't get theirs rather than reporting a
        // bare count — the count alone can't tell you a send failed.
        const notes: string[] = [];
        if (result.skippedNoEmail.length > 0) {
          notes.push(`no email address on file for ${result.skippedNoEmail.join(", ")}`);
        }
        if (result.failed.length > 0) {
          notes.push(`Gmail wouldn't send to ${result.failed.join(", ")} — tell them another way`);
        }
        setMessage(
          `Marked approved. Emailed ${result.emailed} staff member${result.emailed === 1 ? "" : "s"} their dates` +
            (result.emailed > 0 ? " (copies are in your Gmail Sent folder)" : "") +
            "." +
            (notes.length > 0 ? ` Didn't go out — ${notes.join("; ")}.` : "")
        );
      } catch {
        setError("Couldn't approve the schedule — please try again.");
      }
    });
  }

  return (
    <div>
      <button className="btn-primary" disabled={pending} onClick={handleClick}>
        <CheckCircle2 size={14} /> {pending ? "Approving…" : approvedAt ? "Re-approve & notify" : "Approve schedule"}
      </button>
      {approvedAt && !message && (
        <div style={{ fontSize: 11.5, color: "var(--good)", fontWeight: 600, marginTop: 6 }}>
          Approved {new Date(approvedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </div>
      )}
      {message && <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginTop: 6, maxWidth: 260 }}>{message}</div>}
      {error && <div style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 600, marginTop: 6 }}>{error}</div>}

      {sendLog.length > 0 && (
        <div style={{ marginTop: 10, padding: "9px 11px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, maxWidth: 280 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
            <Send size={10} /> Already notified this month
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sendLog.map((entry, i) => {
              const names = entry.recipient_names;
              const preview = names.length > 4 ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more` : names.join(", ");
              return (
                <div key={i}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)" }}>
                    {new Date(entry.sent_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                    {entry.sent_by} → {names.length} {names.length === 1 ? "person" : "people"}: {preview}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
