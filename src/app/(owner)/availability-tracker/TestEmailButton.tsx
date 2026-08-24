"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, MailCheck } from "lucide-react";
import { sendTestEmail } from "./actions";

// Deliberately has no confirm() dialog, unlike every other send in this app:
// it can only ever reach the studio's own inbox, so there's nothing to
// accidentally send to the wrong person. Making it one frictionless click is
// the point — it's meant to be pressed whenever there's any doubt.
export function TestEmailButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        className="btn-secondary"
        style={{ fontSize: 12, padding: "5px 10px" }}
        title="Sends one email to the studio inbox to check the email connection is working. Never goes to staff."
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            try {
              const outcome = await sendTestEmail();
              setResult(
                outcome.ok
                  ? { ok: true, text: `Test email sent to ${outcome.sentTo} — check your inbox. Email is working.` }
                  : { ok: false, text: `Email isn't working: ${outcome.error}` }
              );
            } catch {
              setResult({ ok: false, text: "Email isn't working — couldn't reach Gmail at all." });
            }
          })
        }
      >
        <MailCheck size={13} /> {pending ? "Sending…" : "Test email"}
      </button>

      {result && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.4,
            color: result.ok ? "var(--good)" : "var(--bad)",
            background: result.ok ? "rgba(30,138,98,0.09)" : "rgba(190,50,50,0.07)",
            border: `1px solid ${result.ok ? "rgba(30,138,98,0.35)" : "rgba(190,50,50,0.3)"}`,
            borderRadius: 8,
            padding: "8px 10px",
            marginTop: 8,
            maxWidth: 420,
          }}
        >
          {result.ok ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
}
