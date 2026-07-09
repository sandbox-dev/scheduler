"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { fmtDate } from "@/lib/scheduling";
import { setStaffAvailability } from "./actions";

type PictureDayInfo = { id: string; date: string };

export function AvailabilityChips({
  staffId,
  pictureDays,
  initialAvailableIds,
}: {
  staffId: string;
  pictureDays: PictureDayInfo[];
  initialAvailableIds: string[];
}) {
  const [available, setAvailable] = useState(() => new Set(initialAvailableIds));
  const [, startTransition] = useTransition();

  function toggle(pictureDayId: string) {
    const next = !available.has(pictureDayId);
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
            onClick={() => toggle(pd.id)}
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
