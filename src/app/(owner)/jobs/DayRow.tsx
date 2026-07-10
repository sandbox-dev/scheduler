"use client";

import { useTransition } from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { crewFor, fmtDate, mileagePayFor } from "@/lib/scheduling";
import type { PictureDay } from "@/lib/types";
import { updateDay } from "./actions";

function AdjustStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginRight: 8 }}>
      {label}
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: "1px 5px", fontSize: 10 }}
        onClick={() => onChange(value - 1)}
        title={`One fewer ${label.toLowerCase()}`}
      >
        <Minus size={9} />
      </button>
      <button
        type="button"
        className="btn-secondary"
        style={{ padding: "1px 5px", fontSize: 10 }}
        onClick={() => onChange(value + 1)}
        title={`One more ${label.toLowerCase()}`}
      >
        <Plus size={9} />
      </button>
    </span>
  );
}

export function DayRow({ day }: { day: PictureDay }) {
  const [, startTransition] = useTransition();
  const crew = crewFor(day);
  const { wd, md } = fmtDate(day.date);

  return (
    <tr style={day.needs_review ? { background: "var(--gold-tint)" } : undefined}>
      <td style={{ fontWeight: 600 }}>
        {wd} {md}
        {day.needs_review && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--navy)", fontWeight: 700, marginTop: 3 }}>
            <AlertTriangle size={11} /> Needs review
          </div>
        )}
      </td>
      <td>
        <input
          type="number"
          min={1}
          className="field-input"
          style={{ width: 64 }}
          defaultValue={day.setups}
          onBlur={(e) => {
            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
            startTransition(() => updateDay(day.id, "setups", val));
          }}
        />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 2.1 }}>
          <AdjustStepper
            label={`${crew.Photographer} photog${day.has_group_photo ? " (incl. 1 group)" : ""}`}
            value={day.photographer_adjustment}
            onChange={(next) => startTransition(() => updateDay(day.id, "photographer_adjustment", next))}
          />
          <AdjustStepper
            label={`${crew.Assistant} asst`}
            value={day.assistant_adjustment}
            onChange={(next) => startTransition(() => updateDay(day.id, "assistant_adjustment", next))}
          />
          <AdjustStepper
            label={`${crew.Supervisor} sup`}
            value={day.supervisor_adjustment}
            onChange={(next) => startTransition(() => updateDay(day.id, "supervisor_adjustment", next))}
          />
        </div>
      </td>
      <td>
        <input
          type="number"
          step="1"
          className="field-input"
          style={{ width: 78 }}
          defaultValue={day.round_trip_miles}
          onBlur={(e) => {
            const val = parseFloat(e.target.value) || 0;
            startTransition(() => updateDay(day.id, "round_trip_miles", val));
          }}
        />
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
          ${mileagePayFor(day.round_trip_miles).toFixed(2)} per person
        </div>
      </td>
      <td>
        <input
          type="checkbox"
          defaultChecked={day.requires_supervisor}
          onChange={(e) => startTransition(() => updateDay(day.id, "requires_supervisor", e.target.checked))}
        />
      </td>
      <td>
        <input
          type="checkbox"
          defaultChecked={day.is_outdoor}
          onChange={(e) => startTransition(() => updateDay(day.id, "is_outdoor", e.target.checked))}
        />
      </td>
      <td>
        <input
          type="checkbox"
          defaultChecked={day.has_group_photo}
          onChange={(e) => startTransition(() => updateDay(day.id, "has_group_photo", e.target.checked))}
        />
      </td>
      <td>
        <input
          type="checkbox"
          defaultChecked={day.has_trainee}
          onChange={(e) => startTransition(() => updateDay(day.id, "has_trainee", e.target.checked))}
        />
      </td>
    </tr>
  );
}
