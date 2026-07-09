"use client";

import { useTransition } from "react";
import { updateJobField } from "./actions";

export function EnrollmentInput({ jobId, enrollment }: { jobId: string; enrollment: number | null }) {
  const [, startTransition] = useTransition();

  return (
    <input
      type="number"
      min={0}
      className="field-input"
      style={{ width: 130, fontSize: 12 }}
      placeholder="Enrollment"
      defaultValue={enrollment ?? ""}
      onBlur={(e) => {
        const value = e.target.value.trim() ? parseInt(e.target.value, 10) : null;
        startTransition(() => updateJobField(jobId, "enrollment", value));
      }}
    />
  );
}
