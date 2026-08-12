"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { generateAndSaveSchedule } from "./actions";

// `jobNames` is exactly which unlocked jobs have a Picture Day this month
// — the same filter generateAndSaveSchedule itself applies — so the
// confirm dialog names what's actually about to be wiped and reassigned,
// not just a generic warning. A locked job someone forgot to re-lock
// after an edit doesn't get silently caught up in this otherwise (Adi,
// 2026-08-12: "make sure we're not breaking things").
export function GenerateButton({ hasSchedule, month, jobNames }: { hasSchedule: boolean; month: string; jobNames: string[] }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    // Only Regenerate risks wiping something real — a first-time Generate
    // has no existing assignments to lose, so it proceeds without asking.
    if (hasSchedule) {
      const list = jobNames.length > 0 ? jobNames.join(", ") : "no jobs (nothing unlocked has a Picture Day this month)";
      if (!confirm(`Regenerate the schedule for this month? This will wipe and reassign: ${list}. Locked jobs are skipped.`)) return;
    }
    startTransition(() => generateAndSaveSchedule(month));
  }

  return (
    <button className="btn-primary" disabled={pending} onClick={handleClick} title="Skips any locked jobs">
      <Sparkles size={14} /> {pending ? "Generating…" : hasSchedule ? "Regenerate" : "Generate schedule"}
    </button>
  );
}
