"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { setSharePhone } from "./phoneActions";

export const SHARE_PHONE_QUESTION = "Share your phone number with your team, so they can call or text you on picture days?";

// Asked once (share_phone null), then a small line to change it later.
export function SharePhonePrompt({ current }: { current: boolean | null }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (share: boolean) =>
    start(async () => {
      try {
        await setSharePhone(share);
        setValue(share);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that — please try again.");
      }
    });

  if (value === null) {
    return (
      <Card>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{SHARE_PHONE_QUESTION}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-primary" disabled={pending} onClick={() => choose(true)} style={{ flex: 1, justifyContent: "center" }}>Yes, Share It</button>
          <button className="btn-secondary" disabled={pending} onClick={() => choose(false)} style={{ flex: 1, justifyContent: "center" }}>No Thanks</button>
        </div>
        {error && <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 8 }}>{error}</div>}
      </Card>
    );
  }
  return (
    <div style={{ fontSize: 13.5, color: "var(--muted)", textAlign: "center" }}>
      {value ? "Your phone number is shared with your team." : "Your phone number isn't shared with your team."}{" "}
      <button
        type="button"
        disabled={pending}
        onClick={() => choose(!value)}
        style={{ background: "none", border: "none", padding: 0, color: "var(--navy)", textDecoration: "underline", cursor: "pointer", fontSize: 13.5 }}
      >
        {value ? "Stop sharing" : "Share it"}
      </button>
      {error && <div style={{ color: "var(--bad)" }}>{error}</div>}
    </div>
  );
}
