"use client";

import { useTransition } from "react";
import { QUALIFICATIONS, ROLES, type Staff } from "@/lib/types";
import { setStaffActive, setStaffMileageEligible, toggleStaffCategory, toggleStaffRole, updateStaffField } from "./actions";

export function StaffRow({ staff }: { staff: Staff }) {
  const [, startTransition] = useTransition();

  return (
    <tr style={{ opacity: staff.active ? 1 : 0.5 }}>
      <td style={{ fontWeight: 700 }}>{staff.name}</td>
      <td>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {ROLES.filter((role) => role !== "Trainee").map((role) => (
            <label key={role} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={staff.roles.includes(role)}
                onChange={() => startTransition(() => toggleStaffRole(staff.id, role, staff.roles))}
              />
              {role}
            </label>
          ))}
        </div>
      </td>
      <td>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 260 }}>
          {QUALIFICATIONS.map((cat) => (
            <label key={cat} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={staff.categories.includes(cat)}
                onChange={() => startTransition(() => toggleStaffCategory(staff.id, cat, staff.categories))}
              />
              {cat}
            </label>
          ))}
        </div>
      </td>
      <td>
        <input
          type="text"
          className="field-input"
          style={{ width: 130 }}
          placeholder="e.g. Oakland, CA"
          defaultValue={staff.location}
          onBlur={(e) => startTransition(() => updateStaffField(staff.id, "location", e.target.value.trim()))}
        />
      </td>
      <td>
        <input
          type="number"
          min={1}
          max={5}
          className="field-input"
          style={{ width: 60 }}
          defaultValue={staff.seniority}
          onBlur={(e) =>
            startTransition(() =>
              updateStaffField(staff.id, "seniority", Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1)))
            )
          }
        />
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <button className="btn-secondary" onClick={() => startTransition(() => setStaffActive(staff.id, !staff.active))}>
            {staff.active ? "Deactivate" : "Reactivate"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={staff.mileage_eligible}
              onChange={(e) => startTransition(() => setStaffMileageEligible(staff.id, e.target.checked))}
            />
            Paid mileage
          </label>
        </div>
      </td>
    </tr>
  );
}
