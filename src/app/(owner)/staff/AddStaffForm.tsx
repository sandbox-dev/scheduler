"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CategoryToggleChip, RoleToggleChip } from "@/components/ui";
import { QUALIFICATIONS, ROLES, type Qualification, type Role } from "@/lib/types";
import { addStaff } from "./actions";

export function AddStaffForm() {
  const [state, formAction, pending] = useActionState(addStaff, undefined);
  const [roles, setRoles] = useState<Set<Role>>(new Set());
  const [categories, setCategories] = useState<Set<Qualification>>(new Set());

  function toggle<T>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  }

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
          <select className="field-select" name="priority" defaultValue="1">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Priority {n}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 24, marginBottom: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>ROLES</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROLES.filter((r) => r !== "Trainee").map((r) => (
                <RoleToggleChip key={r} role={r} active={roles.has(r)} onClick={() => toggle(roles, setRoles, r)} />
              ))}
            </div>
            {Array.from(roles).map((r) => (
              <input key={r} type="hidden" name={`role_${r}`} value="on" />
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>QUALIFIED CATEGORIES</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {QUALIFICATIONS.map((c) => (
                <CategoryToggleChip key={c} label={c} active={categories.has(c)} onClick={() => toggle(categories, setCategories, c)} />
              ))}
            </div>
            {Array.from(categories).map((c) => (
              <input key={c} type="hidden" name={`category_${c}`} value="on" />
            ))}
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
