"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { fmtDate } from "@/lib/scheduling";
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

  // This directly overrides what the staff member themselves submitted (or
  // hasn't yet) — a real scheduling-affecting change, not just a display
  // toggle, and easy to fire by an accidental click while scanning the
  // tracker. Confirm every time, matching the same rule as any other
  // real-effect action in this app.
  function toggle(pictureDayId: string, date: string) {
    const next = !available.has(pictureDayId);
    const { wd, md } = fmtDate(date);
    const confirmed = confirm(`Mark ${staffName} as ${next ? "available" : "NOT available"} for ${wd} ${md}?`);
    if (!confirmed) return;

    setAvailable((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(pictureDayId);
      else copy.delete(pictureDayId);
      return copy;
    });
    startTransition(() => setStaffAvailability(staffId, pictureDayId, next));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {pictureDays.map((pd) => {
        const isAvail = available.has(pd.id);
        const { wd, md } = fmtDate(pd.date);
        return (
          <button
            key={pd.id}
            type="button"
            onClick={() => toggle(pd.id, pd.date)}
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
