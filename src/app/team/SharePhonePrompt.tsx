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
  // Answered just now — a short note; it lives in Settings from here on.
  return <div style={{ fontSize: 13.5, color: "var(--good)", fontWeight: 600, textAlign: "center" }}>✓ Saved. You can change this anytime in Settings (☰).</div>;
}

// The Settings page version: the same question, with the current answer
// picked.
export function SharePhoneSetting({ current }: { current: boolean | null }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const choose = (share: boolean) =>
    start(async () => {
      try {
        await setSharePhone(share);
        setValue(share);
        setNote({ ok: true, text: share ? "✓ Your number is shared with your team." : "✓ Your number isn't shared." });
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't save that — please try again." });
      }
    });
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Phone Number</div>
      <div style={{ fontSize: 16, marginBottom: 10 }}>{SHARE_PHONE_QUESTION}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className={value === true ? "btn-primary" : "btn-secondary"} disabled={pending} onClick={() => choose(true)} style={{ flex: 1, justifyContent: "center" }}>Yes, Share It</button>
        <button className={value === false ? "btn-primary" : "btn-secondary"} disabled={pending} onClick={() => choose(false)} style={{ flex: 1, justifyContent: "center" }}>No Thanks</button>
      </div>
      {note && <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 8, color: note.ok ? "var(--good)" : "var(--bad)" }}>{note.text}</div>}
    </div>
  );
}
