"use client";

import { useState, useTransition } from "react";
import { setEnrollmentConfirmed } from "./actions";
import type { EnrollmentStatus } from "@/lib/data";

// Where this job's enrollment stands, next to the Enrollment box. Adi,
// 2026-09-27: numbers were entered this season before any of this existed,
// so each one can be reviewed and marked confirmed here.
export function EnrollmentStatusChip({ jobId, status }: { jobId: string; status: EnrollmentStatus | undefined }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!status) return null;

  function set(confirmed: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await setEnrollmentConfirmed(jobId, confirmed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Didn't work — please try again.");
      }
    });
  }

  const chip = (text: string, bg: string, fg: string) => (
    <span style={{ fontSize: 11, fontWeight: 700, background: bg, color: fg, borderRadius: 6, padding: "2px 8px" }}>{text}</span>
  );

  let body: React.ReactNode;
  if (status.from === "this_job" && status.confirmed) {
    body = (
      <button type="button" className="btn-icon" disabled={pending} title="Undo confirmed" onClick={() => set(false)} style={{ padding: 0 }}>
        {chip("✓ Confirmed", "var(--sage-tint, #e7f1ea)", "var(--navy)")}
      </button>
    );
  } else if (status.from === "this_job") {
    body = (
      <button type="button" className="btn-secondary" disabled={pending} onClick={() => set(true)} style={{ fontSize: 11.5, padding: "3px 8px" }}>
        Mark Confirmed
      </button>
    );
  } else if (status.from === "last_year") {
    body = chip("From Last Year", "var(--bg)", "var(--muted)");
  } else {
    body = chip("Missing", "rgba(214,69,69,0.1)", "var(--bad)");
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {body}
      {error && <span style={{ fontSize: 11.5, color: "var(--bad)" }}>{error}</span>}
    </span>
  );
}
