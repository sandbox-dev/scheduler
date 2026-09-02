"use client";

import { useTransition } from "react";
import type { EquipmentCase } from "@/lib/types";
import { setCaseActive } from "./actions";

// Folded by default — same reasoning as timeline-builder's Timeline Settings:
// this is something you reach for maybe once a month, not every time you
// open the schedule, so it shouldn't cost anyone permanent screen space.
export function CasesPanel({ cases, defaultOpen }: { cases: EquipmentCase[]; defaultOpen: boolean }) {
  const [pending, startTransition] = useTransition();
  const outCount = cases.filter((c) => !c.active).length;

  return (
    <details open={defaultOpen}>
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          <span className="display" style={{ fontSize: 15, fontWeight: 700 }}>Equipment Cases</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)", marginLeft: 10 }}>
            {outCount > 0 ? `${outCount} out of commission` : "all active"} — click to expand
          </span>
        </span>
      </summary>
      <div style={{ padding: "0 18px 16px" }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
          Mark a case out of commission and the schedule stops handing it out — starting with the next time you
          generate or regenerate a month. It won&apos;t touch anything already scheduled.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cases.map((c) => (
            <div
              key={c.case_number}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                opacity: c.active ? 1 : 0.6,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                Case {c.case_number}
                {!c.active && <span style={{ marginLeft: 8, fontWeight: 600, fontSize: 12.5, color: "var(--muted)" }}>Out of commission</span>}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => startTransition(() => setCaseActive(c.case_number, !c.active))}
              >
                {c.active ? "Mark Out Of Commission" : "Mark Active"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
