"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/scheduling";
import { submitAvailability, submitAvailabilityNote } from "./actions";

type PictureDayInfo = { id: string; date: string; job_name: string; category: string };
type StaffInfo = { id: string; name: string };
type ExistingRow = { staff_id: string; picture_day_id: string; available: boolean };
type NoteRow = { staff_id: string; note: string };

export function AvailabilityForm({
  token,
  staff,
  pictureDays,
  existing,
  notes,
}: {
  token: string;
  staff: StaffInfo[];
  pictureDays: PictureDayInfo[];
  existing: ExistingRow[];
  notes: NoteRow[];
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id || "");
  const [available, setAvailable] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    existing.forEach((e) => {
      map[`${e.staff_id}_${e.picture_day_id}`] = e.available;
    });
    return map;
  });
  const [notesByStaff, setNotesByStaff] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    notes.forEach((n) => {
      map[n.staff_id] = n.note;
    });
    return map;
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [notePending, startNoteTransition] = useTransition();

  const selectedStaff = staff.find((s) => s.id === staffId);

  function toggle(dayId: string) {
    const key = `${staffId}_${dayId}`;
    const next = !available[key];
    setAvailable((prev) => ({ ...prev, [key]: next }));
    setSaved(null);
    startTransition(async () => {
      try {
        await submitAvailability(token, staffId, dayId, next);
        setSaved(`Saved for ${selectedStaff?.name}.`);
      } catch {
        setAvailable((prev) => ({ ...prev, [key]: !next }));
      }
    });
  }

  function saveNote(value: string) {
    setNotesByStaff((prev) => ({ ...prev, [staffId]: value }));
    startNoteTransition(() => submitAvailabilityNote(token, staffId, value));
  }

  return (
    <Card>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
          Who are you?
        </label>
        <select className="field-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
        Tap every date you&apos;re available for, {selectedStaff?.name || "…"}:
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {pictureDays.map((pd) => {
          const key = `${staffId}_${pd.id}`;
          const isAvail = !!available[key];
          const { wd, md } = fmtDate(pd.date);
          return (
            <div key={pd.id} className={`chip ${isAvail ? "available" : ""}`} onClick={() => toggle(pd.id)}>
              {isAvail ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {wd} {md}
            </div>
          );
        })}
      </div>

      {pending && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Saving…</div>}
      {!pending && saved && <div style={{ fontSize: 12, color: "var(--good)", fontWeight: 600, marginTop: 12 }}>{saved}</div>}

      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
          Anything we should know? (optional — scheduling preference, a hard-out time, etc.)
        </label>
        <textarea
          key={staffId}
          className="field-textarea"
          rows={3}
          placeholder="e.g. Please schedule me as much as possible, or: I have to leave by 2pm on the 13th."
          defaultValue={notesByStaff[staffId] || ""}
          onBlur={(e) => saveNote(e.target.value)}
        />
        {notePending && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Saving note…</div>}
      </div>
    </Card>
  );
}
