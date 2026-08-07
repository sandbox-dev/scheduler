"use client";

import { useState, useTransition } from "react";
import { CalendarSearch, CheckCircle2, AlertTriangle } from "lucide-react";
import { checkPixifiReconciliation, type PixifiCheckResult } from "./actions";

export function PixifiCheckButton({ month, monthLabel }: { month: string; monthLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PixifiCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCheck() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await checkPixifiReconciliation(month));
      } catch {
        setError("Couldn't reach the Pixifi feed — please try again.");
      }
    });
  }

  const mismatchCount = result && result.configured ? result.schedulerOnly.length + result.pixifiOnly.length : 0;

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        className="btn-rose"
        title="Fetches Pixifi's calendar feed and compares it against this month's Jobs, flagging anything booked in one but missing from the other."
        disabled={pending}
        onClick={handleCheck}
      >
        <CalendarSearch size={14} /> {pending ? "Checking…" : "Check Pixifi"}
      </button>

      {result && !result.configured && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--navy)",
            background: "var(--gold-tint)",
            border: "1px solid var(--gold)",
            borderRadius: 10,
            padding: "10px 12px",
            marginTop: 10,
            maxWidth: 420,
          }}
        >
          <AlertTriangle size={16} /> No Pixifi feed configured yet — see README. Nothing checked.
        </div>
      )}

      {result && result.configured && mismatchCount === 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--good)",
            background: "rgba(30,138,98,0.09)",
            border: "1px solid rgba(30,138,98,0.35)",
            borderRadius: 10,
            padding: "10px 12px",
            marginTop: 10,
            maxWidth: 420,
          }}
        >
          <CheckCircle2 size={16} /> No mismatches — {monthLabel} matches Pixifi.
        </div>
      )}

      {result && result.configured && mismatchCount > 0 && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--ink)",
            background: "var(--rose-tint)",
            border: "1px solid var(--rose)",
            borderRadius: 10,
            padding: "10px 12px",
            marginTop: 10,
            maxWidth: 420,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, marginBottom: 8 }}>
            <AlertTriangle size={16} /> {mismatchCount} mismatch{mismatchCount === 1 ? "" : "es"} for {monthLabel}
          </div>
          {result.pixifiOnly.length > 0 && (
            <div style={{ marginBottom: result.schedulerOnly.length > 0 ? 8 : 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>In Pixifi but not in Scheduler:</div>
              {result.pixifiOnly.map((e, i) => (
                <div key={i}>
                  {e.date} — {e.summary || "(no title)"}
                </div>
              ))}
            </div>
          )}
          {result.schedulerOnly.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>In Scheduler but not in Pixifi:</div>
              {result.schedulerOnly.map((d, i) => (
                <div key={i}>
                  {d.date} — {d.school}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 600, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
