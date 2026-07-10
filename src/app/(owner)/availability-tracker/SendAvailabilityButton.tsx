"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { sendAvailabilityRequests } from "./actions";

export function SendAvailabilityButton({ month, linkUrl }: { month: string; linkUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn-secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await sendAvailabilityRequests(month, linkUrl);
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
