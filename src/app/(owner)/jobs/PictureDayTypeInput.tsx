"use client";

import { useState, useTransition } from "react";
import { updatePictureDayType } from "./actions";

const STANDARD = ["Fall", "Spring", "Graduation", "MUD"];
const NEW = "__new__";

// Worked out on its own (from the booking name or date) and shown for review;
// pick another to correct it, or type a new one. See resolve_picture_day_types.
export function PictureDayTypeInput({
  jobId,
  resolved,
  isAuto,
  schoolTypes,
}: {
  jobId: string;
  resolved: string | null;
  isAuto: boolean;
  schoolTypes: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = [...STANDARD, ...schoolTypes.filter((t) => !STANDARD.includes(t))];
  if (!isAuto && resolved && !options.includes(resolved)) options.push(resolved);

  function save(value: string | null) {
    setError(null);
    startTransition(async () => {
      try {
        await updatePictureDayType(jobId, value);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Didn't save — please try again.");
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <select
        className="field-select"
        style={{ fontSize: 12, width: "auto", padding: "5px 8px" }}
        title="Picture Day Type"
        disabled={pending}
        value={isAuto ? "" : resolved ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === NEW) {
            const name = window.prompt("New picture day type for this school (e.g. Spring Senior Portraits):", "");
            if (name && name.trim()) save(name.trim());
            return;
          }
          save(v || null);
        }}
      >
        <option value="">{resolved ? `${resolved} (auto)` : "Picture day type (auto)"}</option>
        {options.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
        <option value={NEW}>+ New Type…</option>
      </select>
      {error && <span style={{ fontSize: 11.5, color: "var(--bad)" }}>{error}</span>}
    </span>
  );
}
