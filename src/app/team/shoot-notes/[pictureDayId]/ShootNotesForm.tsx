"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import {
  FILLED_BY_QUESTION,
  NEXT_TIME_HINT,
  NEXT_TIME_QUESTION,
  OTHER_HINT,
  OTHER_QUESTION,
  YES_NO_QUESTIONS,
  missingShootNotes,
  type ShootNotesAnswers,
} from "@/lib/shootNotes";
import { submitShootNotes } from "./actions";

const labelStyle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: "var(--ink)" };
const hintStyle: React.CSSProperties = { fontSize: 14, color: "var(--muted)", marginTop: 2 };

export function ShootNotesForm({ pictureDayId, team, me }: { pictureDayId: string; team: string[]; me: string }) {
  const [a, setA] = useState<ShootNotesAnswers>({
    filled_by: team.includes(me) ? [me] : [],
    individual_as_expected: null,
    individual_note: "",
    on_time: null,
    timeline_note: "",
    parking_as_described: null,
    parking_note: "",
    group_as_expected: null,
    group_note: "",
    other_notes: "",
    next_time: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const set = (patch: Partial<ShootNotesAnswers>) => {
    setA((prev) => ({ ...prev, ...patch }));
    setError(null);
  };

  async function submit() {
    const missing = missingShootNotes(a);
    if (missing.length) {
      setError(`Please answer: ${missing.join(", ")}.`);
      return;
    }
    if (!window.confirm("Send the Shoot Notes for this day? Once sent, they can't be changed.")) return;
    setSaving(true);
    const res = await submitShootNotes(pictureDayId, a);
    setSaving(false);
    if ("error" in res) setError(res.error);
    else setDone(true);
  }

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "24px 8px" }}>
        <CheckCircle2 size={34} color="var(--good)" />
        <div className="display" style={{ fontSize: 19, fontWeight: 700, marginTop: 8 }}>Shoot Notes sent — thank you!</div>
        <Link href="/team" className="btn-secondary" style={{ marginTop: 16, display: "inline-flex" }}>Back To Your Jobs</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={labelStyle}>{FILLED_BY_QUESTION} <span style={{ color: "var(--bad)" }}>*</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {team.map((name) => (
            <label key={name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
              <input
                type="checkbox"
                style={{ width: 20, height: 20 }}
                checked={a.filled_by.includes(name)}
                onChange={(e) => set({ filled_by: e.target.checked ? [...a.filled_by, name] : a.filled_by.filter((n) => n !== name) })}
              />
              {name}
            </label>
          ))}
        </div>
      </div>

      {YES_NO_QUESTIONS.map((q) => {
        const v = a[q.key];
        const note = String(a[q.noteKey as keyof ShootNotesAnswers] ?? "");
        return (
          <div key={q.key}>
            <div style={labelStyle}>{q.question} <span style={{ color: "var(--bad)" }}>*</span></div>
            <div style={hintStyle}>{q.ifNo}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              {[true, false].map((opt) => (
                <button
                  key={String(opt)}
                  type="button"
                  onClick={() => set({ [q.key]: opt } as Partial<ShootNotesAnswers>)}
                  className={v === opt ? "btn-primary" : "btn-secondary"}
                  style={{ flex: 1, justifyContent: "center", fontSize: 16, padding: "10px 0" }}
                >
                  {opt ? "Yes" : "No"}
                </button>
              ))}
            </div>
            {v === false && (
              <textarea
                className="field-textarea"
                rows={3}
                value={note}
                autoFocus
                onChange={(e) => set({ [q.noteKey]: e.target.value } as Partial<ShootNotesAnswers>)}
                style={{ marginTop: 8, fontSize: 16 }}
              />
            )}
          </div>
        );
      })}

      <div>
        <div style={labelStyle}>{OTHER_QUESTION}</div>
        <div style={hintStyle}>{OTHER_HINT}</div>
        <textarea className="field-textarea" rows={3} value={a.other_notes} onChange={(e) => set({ other_notes: e.target.value })} style={{ marginTop: 8, fontSize: 16 }} />
      </div>
      <div>
        <div style={labelStyle}>{NEXT_TIME_QUESTION}</div>
        <div style={hintStyle}>{NEXT_TIME_HINT}</div>
        <textarea className="field-textarea" rows={3} value={a.next_time} onChange={(e) => set({ next_time: e.target.value })} style={{ marginTop: 8, fontSize: 16 }} />
      </div>

      {error && <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--bad)" }}>{error}</div>}
      <button className="btn-primary" type="button" disabled={saving} onClick={submit} style={{ justifyContent: "center", fontSize: 16, padding: "12px 0" }}>
        {saving ? "Sending…" : "Submit"}
      </button>
    </div>
  );
}
