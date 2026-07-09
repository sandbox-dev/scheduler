"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeJob } from "./actions";

export function RemoveJobButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="btn-secondary"
      disabled={pending}
      onClick={() => {
        if (confirm("Remove this job and all its Picture Days?")) {
          startTransition(() => removeJob(jobId));
        }
      }}
    >
      <Trash2 size={13} /> Remove
    </button>
  );
}
