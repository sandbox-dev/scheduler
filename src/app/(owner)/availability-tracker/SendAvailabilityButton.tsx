"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { sendAvailabilityRequests } from "./actions";

// datetime-local inputs need "yyyy-MM-ddTHH:mm" in the viewer's local time,
// not the ISO/UTC string stored on the link.
function toLocalInputValue(isoString: string) {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SendAvailabilityButton({
  month,
  linkUrl,
  initialDeadline,
}: {
  month: string;
  linkUrl: string;
  initialDeadline?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(initialDeadline ? toLocalInputValue(initialDeadline) : "");

  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
        Respond by
        <input
          type="datetime-local"
          className="field-input"
          style={{ display: "block", marginTop: 4, width: 220 }}
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </label>
      <button
        className="btn-secondary"
        disabled={pending || !deadline}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            try {
              const deadlineAt = new Date(deadline).toISOString();
              const result = await sendAvailabilityRequests(month, linkUrl, deadlineAt);
              if (!result.webhookConfigured) {
                setMessage("No notification webhook configured yet — see README to set one up.");
              } else {
                const notes: string[] = [];
                if (result.skippedNoEmail.length > 0) {
                  notes.push(`no email on file for: ${result.skippedNoEmail.join(", ")}`);
                }
                setMessage(
                  `Sent to ${result.sent} staff member${result.sent === 1 ? "" : "s"}, each with their own PIN.` +
                    (notes.length > 0 ? ` Skipped — ${notes.join("; ")}.` : "")
                );
              }
            } catch {
              setError("Couldn't send — please try again.");
            }
          });
        }}
      >
        <Mail size={14} /> {pending ? "Sending…" : "Send availability request"}
      </button>
      {message && <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginTop: 6, maxWidth: 320 }}>{message}</div>}
      {error && <div style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 600, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
