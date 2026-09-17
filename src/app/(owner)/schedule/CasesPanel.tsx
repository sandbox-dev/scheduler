"use client";

import { useState, useTransition } from "react";
import type { EquipmentCase } from "@/lib/types";
import { assignCasesForScope, setCaseActive, type CaseAssignScope } from "./actions";

// Folded by default — same reasoning as timeline-builder's Timeline Settings:
// this is something you reach for maybe once a month, not every time you
// open the schedule, so it shouldn't cost anyone permanent screen space.
export function CasesPanel({
  cases,
  defaultOpen,
  scope,
  scopeLabel,
}: {
  cases: EquipmentCase[];
  defaultOpen: boolean;
  // Whatever range the Month/Week toggle above is currently showing — Assign
  // Cases acts on that same range rather than a separate scope picker.
  scope: CaseAssignScope;
  scopeLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const outCount = cases.filter((c) => !c.active).length;

  function handleAssign(mode: "fillOnly" | "reassignAll") {
    const verb = mode === "fillOnly" ? "Assign cases to every open spot in" : "Reassign cases for EVERY spot (overwriting any already assigned) in";
    if (!confirm(`${verb} ${scopeLabel}?`)) return;
    setResult(null);
    setAssigning(true);
    startTransition(async () => {
      try {
        const { updated, total } = await assignCasesForScope(scope, mode);
        setResult(
          total === 0
            ? "No Photographer spots in that range yet."
            : updated === 0
              ? mode === "fillOnly"
                ? "Nothing to do — every spot already has a case."
                : "No changes — every spot already had its correct case."
              : `${mode === "fillOnly" ? "Assigned" : "Reassigned"} ${updated} of ${total} spot${total === 1 ? "" : "s"}.`
        );
      } finally {
        setAssigning(false);
      }
    });
  }

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
          Mark a case out of commission and it stops getting handed out — but nothing already assigned changes on its
          own. Use Assign/Reassign Cases below (for {scopeLabel}) once you&apos;re ready to actually apply that.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
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
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Assign / Reassign Cases</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
            Applies to {scopeLabel}. To change that, use the Month / Week tabs at the top of the page, then come back
            here.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-secondary" disabled={assigning} onClick={() => handleAssign("fillOnly")}>
              {assigning ? "Working…" : "Assign Cases (fill empty spots)"}
            </button>
            <button type="button" className="btn-secondary" disabled={assigning} onClick={() => handleAssign("reassignAll")}>
              {assigning ? "Working…" : "Reassign All Cases"}
            </button>
          </div>
          {result && <div style={{ fontSize: 12.5, color: "var(--good)", marginTop: 10 }}>{result}</div>}
        </div>
      </div>
    </details>
  );
}
