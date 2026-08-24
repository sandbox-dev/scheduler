"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { approveSchedule } from "./actions";

export function ApproveButton({ month, approvedAt }: { month: string; approvedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() => {
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
        }}
      >
        <CheckCircle2 size={14} /> {pending ? "Approving…" : approvedAt ? "Re-approve & notify" : "Approve schedule"}
      </button>
      {approvedAt && !message && (
        <div style={{ fontSize: 11.5, color: "var(--good)", fontWeight: 600, marginTop: 6 }}>
          Approved {new Date(approvedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </div>
      )}
      {message && <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginTop: 6, maxWidth: 260 }}>{message}</div>}
      {error && <div style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 600, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
