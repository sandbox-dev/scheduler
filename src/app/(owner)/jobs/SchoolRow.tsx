"use client";

import { useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import type { School } from "@/lib/types";
import { updateSchoolField } from "./actions";

export function SchoolRow({ school }: { school: School }) {
  const [, startTransition] = useTransition();
  const missingAddress = !school.address.trim();
  const flagged = missingAddress || school.address_unresolvable;

  return (
    <tr style={flagged ? { background: "var(--gold-tint)" } : undefined}>
      <td style={{ fontWeight: 700 }}>
        {school.name}
        {flagged && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--navy)", fontWeight: 700, marginTop: 3 }}>
            <AlertTriangle size={11} /> {missingAddress ? "No address" : "Couldn't locate this address"}
          </div>
        )}
      </td>
      <td>
        <input
          type="text"
          className="field-input"
          placeholder="Street address, city, state, zip"
          defaultValue={school.address}
          onBlur={(e) => startTransition(() => updateSchoolField(school.id, "address", e.target.value.trim()))}
        />
      </td>
      <td>
        <input
          type="number"
          className="field-input"
          style={{ width: 90 }}
          defaultValue={school.round_trip_miles}
          onBlur={(e) =>
            startTransition(() => updateSchoolField(school.id, "round_trip_miles", parseFloat(e.target.value) || 0))
          }
        />
      </td>
    </tr>
  );
}
