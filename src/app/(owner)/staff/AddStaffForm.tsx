"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui";
import { QUALIFICATIONS, ROLES } from "@/lib/types";
import { addStaff } from "./actions";

export function AddStaffForm() {
  const [state, formAction, pending] = useActionState(addStaff, undefined);

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="display" style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 12 }}>Add staff member</div>
      <form action={formAction}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <input className="field-input" name="name" placeholder="Name" required />
          <input className="field-input" name="phone" placeholder="Phone (optional)" />
          <input className="field-input" name="email" placeholder="Email (optional)" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <input className="field-input" name="location" placeholder="Home city (optional)" />
          <select className="field-select" name="seniority" defaultValue="1">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Seniority {n}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 24, marginBottom: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>ROLES</div>
            <div style={{ display: "flex", gap: 12 }}>
              {ROLES.map((r) => (
                <label key={r} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" name={`role_${r}`} /> {r}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>QUALIFIED CATEGORIES</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {QUALIFICATIONS.map((c) => (
                <label key={c} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" name={`category_${c}`} /> {c}
                </label>
              ))}
            </div>
          </div>
        </div>

        {state?.error && <div style={{ color: "var(--bad)", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{state.error}</div>}

        <button className="btn-primary" type="submit" disabled={pending}>
          <Plus size={14} /> {pending ? "Adding…" : "Add staff member"}
        </button>
      </form>
    </Card>
  );
}
