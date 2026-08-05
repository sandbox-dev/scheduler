"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { sendAvailabilityRequests } from "./actions";

// datetime-local inputs need "yyyy-MM-ddTHH:mm" in the viewer's local time,
// not the ISO/UTC string stored on the link.
function toLocalInputValue(isoString: string) {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type StaffOption = { id: string; name: string };

export function SendAvailabilityButton({
  month,
  linkUrl,
  initialDeadline,
  staff,
}: {
  month: string;
  linkUrl: string;
  initialDeadline?: string | null;
  staff: StaffOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ kind: "sent" | "not-configured"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(initialDeadline ? toLocalInputValue(initialDeadline) : "");
  // "Everyone" is the common case (a fresh month) — the picker only needs
  // opening for the exceptions Adi described: a staff member added
  // mid-month, or re-flagging a last-minute new date to specific people.
  const [scope, setScope] = useState<"all" | "specific">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(staff.map((s) => s.id)));

  const targetIds = useMemo(
    () => (scope === "all" ? staff.map((s) => s.id) : Array.from(selectedIds)),
    [scope, staff, selectedIds]
  );
  const targetNames = useMemo(
    () => (scope === "all" ? [`all ${targetIds.length} active staff`] : staff.filter((s) => selectedIds.has(s.id)).map((s) => s.name)),
    [scope, staff, selectedIds, targetIds]
  );

  function toggleStaff(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSend() {
    setError(null);
    setResult(null);

    // This sends real emails immediately with no way to unsend — Adi hit
    // this exact problem (accidentally sent live requests while testing,
    // asked "can we unsend???"). A confirm() dialog spelling out exactly
    // who and what deadline, every time, is the guard against that.
    const deadlineLabel = new Date(deadline).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
    const confirmed = confirm(
      `Send a real email to: ${targetNames.join(", ")}?\n\nRespond-by deadline: ${deadlineLabel}\n\nThis can't be undone. Continue?`
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const deadlineAt = new Date(deadline).toISOString();
        const outcome = await sendAvailabilityRequests(month, linkUrl, deadlineAt, targetIds);
        if (!outcome.webhookConfigured) {
          setResult({ kind: "not-configured", text: "No notification webhook configured yet — see README to set one up. Nothing was sent." });
        } else {
          const notes: string[] = [];
          if (outcome.skippedNoEmail.length > 0) {
            notes.push(`no email on file for: ${outcome.skippedNoEmail.join(", ")}`);
          }
          setResult({
            kind: "sent",
            text:
              `Sent to ${outcome.sent} staff member${outcome.sent === 1 ? "" : "s"}, each with their own PIN.` +
              (notes.length > 0 ? ` Skipped — ${notes.join("; ")}.` : ""),
          });
        }
      } catch {
        setError("Couldn't send — please try again.");
      }
    });
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
        Respond by
        <input
          type="datetime-local"
          className="field-input"
          style={{ display: "block", marginTop: 4, width: 220 }}
          value={deadline}
          onChange={(e) => {
            setDeadline(e.target.value);
            setResult(null);
          }}
        />
      </label>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {(["all", "specific"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={scope === s ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 12, padding: "5px 10px" }}
            onClick={() => setScope(s)}
          >
            {s === "all" ? "Everyone" : "Choose who"}
          </button>
        ))}
      </div>

      {scope === "specific" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, maxWidth: 420 }}>
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              style={
                selectedIds.has(s.id)
                  ? { background: "var(--gold-tint)", color: "var(--navy)", borderColor: "var(--gold)" }
                  : undefined
              }
              onClick={() => toggleStaff(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn-secondary"
        title="Emails every selected staff member their own PIN and the shared availability link for this month, and sets the deadline above. Asks you to confirm first — this sends real email."
        disabled={pending || !deadline || targetIds.length === 0}
        onClick={handleSend}
      >
        <Mail size={14} /> {pending ? "Sending…" : scope === "all" ? "Send availability request" : `Send to ${targetIds.length} selected`}
      </button>

      {result && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: result.kind === "sent" ? "var(--good)" : "var(--navy)",
            background: result.kind === "sent" ? "rgba(30,138,98,0.09)" : "var(--gold-tint)",
            border: `1px solid ${result.kind === "sent" ? "rgba(30,138,98,0.35)" : "var(--gold)"}`,
            borderRadius: 10,
            padding: "10px 12px",
            marginTop: 10,
            maxWidth: 420,
          }}
        >
          {result.kind === "sent" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {result.text}
        </div>
      )}
      {error && <div style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 600, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
