"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui";
import { CATEGORIES, type School } from "@/lib/types";
import { createJob } from "./actions";

export function JobForm({ schools }: { schools: School[] }) {
  const [state, formAction, pending] = useActionState(createJob, undefined);
  const [schoolId, setSchoolId] = useState("");
  const [name, setName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [milesInput, setMilesInput] = useState("");

  function selectSchool(id: string) {
    setSchoolId(id);
    if (!id) return;
    const school = schools.find((s) => s.id === id);
    if (!school) return;
    setName((prev) => prev || school.name);
    setSchoolAddress(school.address);
    setMilesInput(String(school.round_trip_miles));
  }

  return (
    <Card style={{ marginBottom: 20 }}>
      <div className="display" style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 12 }}>Add a job</div>

      <form action={formAction}>
        <input type="hidden" name="schoolId" value={schoolId} />

        <div style={{ marginBottom: 10 }}>
          <select className="field-select" value={schoolId} onChange={(e) => selectSchool(e.target.value)}>
            <option value="">— manual entry, or pick a returning school —</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.round_trip_miles} mi round trip)
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <input
            className="field-input"
            name="name"
            placeholder="Job name (e.g. Jefferson Elementary)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="field-select" name="category" defaultValue={CATEGORIES[0]}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <input className="field-input" name="schoolType" placeholder="School type, for your reference (e.g. TK-8, Pre-8, High School)" />
          <input type="number" min={0} className="field-input" name="enrollment" placeholder="Enrollment (number of students, optional)" />
        </div>

        <input type="hidden" name="client" value={name} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <input
            className="field-input"
            name="schoolAddress"
            placeholder="School address (optional, for your records)"
            value={schoolAddress}
            onChange={(e) => setSchoolAddress(e.target.value)}
          />
          <input
            type="number"
            className="field-input"
            name="milesInput"
            placeholder="Round-trip miles from studio"
            value={milesInput}
            onChange={(e) => setMilesInput(e.target.value)}
          />
        </div>

        {!schoolId && (
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--muted)", marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" name="saveSchool" />
            Save this school so I don&apos;t have to re-enter the address/miles next time it books
          </label>
        )}

        <textarea
          className="field-textarea"
          name="pasteRows"
          rows={4}
          placeholder={"2026-08-27, 3\n2026-08-28\n(leave setups off a line if you don't know it yet — it'll be flagged for review)"}
        />

        {state?.error && (
          <div style={{ color: "var(--bad)", fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>{state.error}</div>
        )}

        <div style={{ marginTop: 12 }}>
          <button className="btn-primary" type="submit" disabled={pending}>
            <Plus size={14} /> {pending ? "Adding…" : "Add job"}
          </button>
        </div>
      </form>
    </Card>
  );
}
