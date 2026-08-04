"use client";

import { useMemo, useState } from "react";
import type { School } from "@/lib/types";
import { SchoolRow } from "./SchoolRow";

export function SchoolsPanel({ schools, defaultOpen }: { schools: School[]; defaultOpen: boolean }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? schools.filter((s) => s.name.toLowerCase().includes(q)) : schools;
  }, [schools, query]);

  return (
    <details open={defaultOpen}>
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "20px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          <span className="display" style={{ fontSize: 15.5, fontWeight: 700 }}>
            Saved schools
          </span>
          <span style={{ fontSize: 12.5, color: "var(--muted)", marginLeft: 10 }}>
            ({schools.length}) — click to expand
          </span>
        </span>
      </summary>
      <div style={{ padding: "0 22px 20px" }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
          Keep addresses current here — they&apos;re used for mileage and for staff-to-school distance lookups on the
          Staff page.
        </div>
        <input
          className="field-input"
          placeholder="Search by school name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12, maxWidth: 320 }}
        />
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "8px 2px" }}>No schools match &quot;{query}&quot;.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Address</th>
                <th>Round-trip miles</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <SchoolRow key={s.id} school={s} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
