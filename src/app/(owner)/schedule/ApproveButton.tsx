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
              if (!result.webhookConfigured) {
                setMessage("Marked approved. (No notification webhook configured yet — see README to set one up.)");
              } else {
                const notes: string[] = [];
                if (result.skippedNoEmail.length > 0) {
                  notes.push(`no email on file for: ${result.skippedNoEmail.join(", ")}`);
                }
                setMessage(
                  `Marked approved. Notified ${result.emailed} staff member${result.emailed === 1 ? "" : "s"}.` +
                    (notes.length > 0 ? ` Skipped — ${notes.join("; ")}.` : "")
                );
              }
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
