"use client";

import { useTransition } from "react";
import { updateJobField } from "./actions";

export function SchoolTypeInput({ jobId, schoolType }: { jobId: string; schoolType: string }) {
  const [, startTransition] = useTransition();

  return (
    <input
      type="text"
      className="field-input"
      style={{ width: 200, fontSize: 12 }}
      placeholder="School type (e.g. TK-8)"
      defaultValue={schoolType}
      onBlur={(e) => startTransition(() => updateJobField(jobId, "school_type", e.target.value.trim()))}
    />
  );
}
