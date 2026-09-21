"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmSchedule } from "./actions";

// A real button the person has to click, not a bare link that auto-confirms
// on page load — an email security scanner pre-fetching every link in an
// inbox would otherwise silently mark someone confirmed before they ever
// saw the message.
export function ConfirmButton({ token, staffName, monthLabel }: { token: string; staffName: string; monthLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await confirmSchedule(token);
      if (result.error) {
        setError("This link isn't working right now — please try again, or reply to your schedule email.");
        return;
      }
      setConfirmed(true);
    });
  }

  if (confirmed) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--good)", fontWeight: 700 }}>
        <CheckCircle2 size={18} /> Thanks — you&#39;re all set for {monthLabel}.
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 14, marginBottom: 14 }}>Hi {staffName},</p>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
        By clicking here I confirm that I have reviewed my <strong>{monthLabel}</strong> schedule in the email you were sent.
      </p>
      <button className="btn-primary" disabled={pending} onClick={handleClick}>
        {pending ? "Confirming…" : "Confirm"}
      </button>
      {error && <div style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 600, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
