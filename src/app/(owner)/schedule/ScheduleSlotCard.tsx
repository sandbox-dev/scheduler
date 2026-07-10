"use client";

import { useTransition } from "react";
import { Award, MapPin, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui";
import { EQUIPMENT_CASE_COUNT } from "@/lib/scheduling";
import type { Role } from "@/lib/types";
import { setAssignmentCase, swapAssignment } from "./actions";

type Option = { id: string; name: string; seniority: number; distance_miles: number; available: boolean };

export function ScheduleSlotCard({
  pictureDayId,
  jobId,
  role,
  slotIndex,
  assigned,
  options,
  isGroupSlot,
  assignmentId,
  equipmentCase,
  conflictWith,
}: {
  pictureDayId: string;
  jobId: string;
  role: Role;
  slotIndex: number;
  assigned: Option | null;
  options: Option[];
  isGroupSlot?: boolean;
  assignmentId: string;
  equipmentCase: string;
  conflictWith?: string[];
}) {
  const [pending, startTransition] = useTransition();

  const available = options.filter((o) => o.available);
  const unavailable = options.filter((o) => !o.available);
  const hasConflict = !!assigned && !!conflictWith && conflictWith.length > 0;

  return (
    <Card
      style={{
        width: 190,
        padding: "10px 12px",
        ...(hasConflict ? { border: "2px solid var(--bad)", background: "rgba(220, 38, 38, 0.06)" } : {}),
      }}
    >
      {hasConflict && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--bad)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertTriangle size={12} /> Also on {conflictWith!.join(", ")}
        </div>
      )}
      {isGroupSlot && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--rose)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>
          Group photo
        </div>
      )}
      {assigned ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{assigned.name}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11, color: "var(--muted)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Award size={11} /> Sr. {assigned.seniority}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <MapPin size={11} /> {assigned.distance_miles}mi
            </span>
          </div>
          {!assigned.available && (
            <div style={{ fontSize: 10.5, color: "var(--bad)", fontWeight: 600, marginTop: 4 }}>Not marked available</div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--navy)", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
          <AlertTriangle size={13} /> No one available
        </div>
      )}
      <select
        className="field-select"
        style={{ marginTop: 8, fontSize: 11.5, padding: "5px 7px" }}
        disabled={pending}
        value={assigned?.id || ""}
        onChange={(e) =>
          startTransition(() => swapAssignment(pictureDayId, jobId, role, slotIndex, e.target.value || null))
        }
      >
        <option value="">— unassigned —</option>
        {available.length > 0 && (
          <optgroup label="Available">
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} (Sr.{o.seniority}, {o.distance_miles}mi)
              </option>
            ))}
          </optgroup>
        )}
        {unavailable.length > 0 && (
          <optgroup label="Not marked available">
            {unavailable.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} (Sr.{o.seniority}, {o.distance_miles}mi)
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {role === "Photographer" && assigned && (
        <select
          className="field-select"
          style={{ marginTop: 6, fontSize: 11.5, padding: "5px 7px" }}
          value={equipmentCase}
          onChange={(e) => startTransition(() => setAssignmentCase(assignmentId, e.target.value))}
        >
          <option value="">Case — none</option>
          {Array.from({ length: EQUIPMENT_CASE_COUNT }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Case {n}
            </option>
          ))}
        </select>
      )}
    </Card>
  );
}
