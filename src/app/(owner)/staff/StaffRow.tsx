"use client";

import { useTransition } from "react";
import { CategoryToggleChip, RoleToggleChip } from "@/components/ui";
import { SavableField } from "@/components/SavableField";
import { QUALIFICATIONS, ROLES, type Staff } from "@/lib/types";
import { setStaffActive, setStaffMileageEligible, toggleStaffCategory, toggleStaffRole, updateStaffField } from "./actions";

export function StaffRow({ staff }: { staff: Staff }) {
  const [, startTransition] = useTransition();

  return (
    <tr style={{ opacity: staff.active ? 1 : 0.5 }}>
      <td style={{ fontWeight: 700 }}>{staff.name}</td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SavableField
            onSave={(value) => updateStaffField(staff.id, "email", value)}
            defaultValue={staff.email}
            type="email"
            placeholder="email@example.com"
            width={170}
          />
          <SavableField
            onSave={(value) => updateStaffField(staff.id, "phone", value)}
            defaultValue={staff.phone}
            type="tel"
            placeholder="(555) 555-5555"
            width={170}
          />
        </div>
      </td>
      <td>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ROLES.filter((role) => role !== "Trainee").map((role) => (
            <RoleToggleChip
              key={role}
              role={role}
              active={staff.roles.includes(role)}
              onClick={() => startTransition(() => toggleStaffRole(staff.id, role, staff.roles))}
            />
          ))}
        </div>
      </td>
      <td>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 300 }}>
          {QUALIFICATIONS.map((cat) => (
            <CategoryToggleChip
              key={cat}
              label={cat}
              active={staff.categories.includes(cat)}
              onClick={() => startTransition(() => toggleStaffCategory(staff.id, cat, staff.categories))}
            />
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
          defaultValue={staff.priority}
          onBlur={(e) =>
            startTransition(() =>
              updateStaffField(staff.id, "priority", Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1)))
            )
          }
        />
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <button className="btn-secondary" onClick={() => startTransition(() => setStaffActive(staff.id, !staff.active))}>
            {staff.active ? "Deactivate" : "Reactivate"}
          </button>
          <button
            type="button"
            className={`chip ${staff.mileage_eligible ? "available" : ""}`}
            style={{ fontSize: 11, padding: "4px 9px" }}
            onClick={() => startTransition(() => setStaffMileageEligible(staff.id, !staff.mileage_eligible))}
          >
            Paid mileage
          </button>
        </div>
      </td>
    </tr>
  );
}
