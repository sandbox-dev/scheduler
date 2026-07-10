"use client";

import { useTransition } from "react";
import { Lock, Unlock } from "lucide-react";
import { toggleJobLock } from "./actions";

export function LockJobButton({ jobId, locked }: { jobId: string; locked: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="btn-secondary"
      disabled={pending}
      onClick={() => startTransition(() => toggleJobLock(jobId, !locked))}
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
