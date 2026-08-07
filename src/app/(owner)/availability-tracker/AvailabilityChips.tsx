"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { fmtDate, groupIdsByDate } from "@/lib/scheduling";
import { setStaffAvailability } from "./actions";

type PictureDayInfo = { id: string; date: string };

export function AvailabilityChips({
  staffId,
  staffName,
  pictureDays,
  initialAvailableIds,
}: {
  staffId: string;
  staffName: string;
  pictureDays: PictureDayInfo[];
  initialAvailableIds: string[];
}) {
  const [available, setAvailable] = useState(() => new Set(initialAvailableIds));
  const [, startTransition] = useTransition();

  // Multiple jobs can be booked on the same calendar date — group so the
  // owner sees (and taps) one chip per day, not one per booking, same as
  // the staff-facing public form.
  const dateGroups = useMemo(() => groupIdsByDate(pictureDays), [pictureDays]);

  // This directly overrides what the staff member themselves submitted (or
  // hasn't yet) — a real scheduling-affecting change, not just a display
  // toggle, and easy to fire by an accidental click while scanning the
  // tracker. Confirm every time, matching the same rule as any other
  // real-effect action in this app. Toggling a date affects every job
  // booked that day together, since availability is inherently per-day.
  function toggle(pictureDayIds: string[], date: string) {
    const next = !pictureDayIds.every((id) => available.has(id));
    const { wd, md } = fmtDate(date);
    const confirmed = confirm(`Mark ${staffName} as ${next ? "available" : "NOT available"} for ${wd} ${md}?`);
    if (!confirmed) return;

    setAvailable((prev) => {
      const copy = new Set(prev);
      for (const id of pictureDayIds) {
        if (next) copy.add(id);
        else copy.delete(id);
      }
      return copy;
    });
    for (const id of pictureDayIds) {
      startTransition(() => setStaffAvailability(staffId, id, next));
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {dateGroups.map(({ date, ids }) => {
        const isAvail = ids.every((id) => available.has(id));
        const { wd, md } = fmtDate(date);
        return (
          <button
            key={date}
            type="button"
            onClick={() => toggle(ids, date)}
            className={`chip ${isAvail ? "available" : ""}`}
            style={{ fontSize: 11.5, padding: "4px 9px" }}
          >
            {isAvail ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {wd} {md}
          </button>
        );
      })}
    </div>
  );
}
