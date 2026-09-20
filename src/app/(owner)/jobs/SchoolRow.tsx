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
    <>
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
      {/* Its own row rather than more table columns — new columns would
          resize the ones above them (AGENTS.md §14's own warning about
          table-layout: auto), and these fields are used far less often than
          the address/miles above them. Staff Notes plus the two Drive
          folder links are all staff-only school facts, so they share one
          row and one caption. */}
      <tr style={flagged ? { background: "var(--gold-tint)" } : undefined}>
        <td colSpan={4} style={{ paddingTop: 0 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "2 1 220px" }}>
              <div style={fieldLabelStyle}>Staff Notes</div>
              <SavableField
                onSave={(value) => updateSchoolField(school.id, "staff_notes", value)}
                defaultValue={school.staff_notes ?? ""}
                placeholder="Parking, gate code, entry instructions..."
                className="field-input-ghost"
              />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={fieldLabelStyle}>Setup Photos</div>
              <SavableField
                onSave={(value) => updateSchoolField(school.id, "setup_photos_url", value)}
                defaultValue={school.setup_photos_url ?? ""}
                placeholder="Drive folder link"
                className="field-input-ghost"
              />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div style={fieldLabelStyle}>Reference Photos</div>
              <SavableField
                onSave={(value) => updateSchoolField(school.id, "reference_photos_url", value)}
                defaultValue={school.reference_photos_url ?? ""}
                placeholder="Drive folder link"
                className="field-input-ghost"
              />
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
            Only staff see these — not shown to the school.
          </div>
        </td>
      </tr>
    </>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 3,
};
