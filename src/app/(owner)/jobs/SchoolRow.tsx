"use client";

import { useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { SavableField } from "@/components/SavableField";
import type { School } from "@/lib/types";
import { deleteSchool, updateSchoolField } from "./actions";

export function SchoolRow({ school }: { school: School }) {
  const [, startTransition] = useTransition();
  const missingAddress = !school.address.trim();
  const flagged = missingAddress || school.address_unresolvable;

  return (
    <tr style={flagged ? { background: "var(--gold-tint)" } : undefined}>
      <td>
        <SavableField
          onSave={(value) => {
            if (value) updateSchoolField(school.id, "name", value);
          }}
          defaultValue={school.name}
          className="field-input-ghost"
          inputStyle={{ fontWeight: 700 }}
          width={180}
          multiline
          rows={2}
        />
        {flagged && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--navy)", fontWeight: 700, marginTop: 3 }}>
            <AlertTriangle size={11} /> {missingAddress ? "No address" : "Couldn't locate this address"}
          </div>
        )}
      </td>
      <td>
        <SavableField
          onSave={(value) => updateSchoolField(school.id, "address", value)}
          defaultValue={school.address}
          placeholder="Street address, city, state, zip"
          className="field-input-ghost"
          width={240}
          multiline
          rows={2}
        />
      </td>
      <td>
        <SavableField
          onSave={(value) => updateSchoolField(school.id, "round_trip_miles", parseFloat(value) || 0)}
          defaultValue={String(school.round_trip_miles)}
          type="number"
          className="field-input-ghost"
          width={72}
        />
      </td>
      <td>
        <button
          type="button"
          className="btn-secondary"
          title="Remove saved school"
          style={{ padding: "6px 8px" }}
          onClick={() => {
            if (confirm(`Remove "${school.name}" from saved schools? Any job that used it keeps its own data — this only removes the shortcut for next time.`)) {
              startTransition(() => deleteSchool(school.id));
            }
          }}
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}
