"use client";

import { useTransition } from "react";
import { Lock, Unlock } from "lucide-react";
import { toggleJobLock } from "./actions";

export function LockJobButton({ jobId, locked, jobName }: { jobId: string; locked: boolean; jobName: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    // Only unlocking needs a confirm — locking is the protective
    // direction, nothing risky about it. Unlocking exposes this job to
    // Regenerate wiping and reassigning it, and to manual edits, until
    // it's re-locked — the exact gap behind Adi's "make sure we're not
    // breaking things" report (2026-08-12): a job unlocked for one small
    // edit and never re-locked got silently caught up in a later
    // Regenerate.
    if (locked && !confirm(`Unlock "${jobName}"? It'll be editable again and no longer protected from Regenerate until you re-lock it.`)) return;
    startTransition(() => toggleJobLock(jobId, !locked));
  }

  return (
    <button
      className="btn-secondary"
      disabled={pending}
      onClick={handleClick}
      title={
        locked
          ? "Unlock to make changes (won't resend staff emails)"
          : "Lock to protect from Regenerate and accidental edits"
      }
    >
      {locked ? <Unlock size={13} /> : <Lock size={13} />} {locked ? "Unlock" : "Lock"}
    </button>
  );
}
