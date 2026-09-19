"use client";

import { useTransition } from "react";
import { updateJobField } from "./actions";

// A link to the school's existing shared Google Drive folder for setup/
// reference photos — shown to staff on the mobile staff view. Optional, so
// left blank for most jobs; only worth filling in when that folder exists.
export function ReferencePhotosInput({ jobId, referencePhotosUrl }: { jobId: string; referencePhotosUrl: string | null }) {
  const [, startTransition] = useTransition();

  return (
    <input
      type="url"
      className="field-input"
      style={{ width: 220, fontSize: 12 }}
      placeholder="Reference Photos Link"
      defaultValue={referencePhotosUrl ?? ""}
      onBlur={(e) => {
        const value = e.target.value.trim() || null;
        startTransition(() => updateJobField(jobId, "reference_photos_url", value));
      }}
    />
  );
}
