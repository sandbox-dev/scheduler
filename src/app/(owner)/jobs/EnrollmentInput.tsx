"use client";

import { useTransition } from "react";
import { updateJobField } from "./actions";

export function EnrollmentInput({ jobId, enrollment, lastYear = null }: { jobId: string; enrollment: number | null; lastYear?: number | null }) {
  const [, startTransition] = useTransition();

  return (
    <input
      type="number"
      min={0}
      className="field-input"
      style={{ width: 130, fontSize: 12 }}
      placeholder={lastYear != null ? `~${lastYear} last year` : "Enrollment"}
      defaultValue={enrollment ?? ""}
      onBlur={(e) => {
        const value = e.target.value.trim() ? parseInt(e.target.value, 10) : null;
        // Only a real change is saved — it also clears Confirmed.
        if (value === enrollment) return;
        startTransition(() => updateJobField(jobId, "enrollment", value));
      }}
    />
  );
}
