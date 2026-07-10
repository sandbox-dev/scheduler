"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Lock } from "lucide-react";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/scheduling";
import { unlockStaffAvailability, submitAvailabilityFinal } from "./actions";

type PictureDayInfo = { id: string; date: string; job_name: string; category: string };
type StaffInfo = { id: string; name: string };

export function AvailabilityForm({
  token,
  staff,
  pictureDays,
}: {
  token: string;
  staff: StaffInfo[];
  pictureDays: PictureDayInfo[];
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id || "");
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [unlockPending, startUnlockTransition] = useTransition();
  const [submitPending, startSubmitTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedStaff = staff.find((s) => s.id === staffId);

  function resetForNewPerson(nextStaffId: string) {
    setStaffId(nextStaffId);
    setPin("");
    setUnlocked(false);
    setAlreadySubmitted(false);
    setJustSubmitted(false);
    setUnlockError(null);
    setSelections(new Set());
    setNote("");
    setSubmitError(null);
  }

  function unlock() {
    setUnlockError(null);
    startUnlockTransition(async () => {
      const result = await unlockStaffAvailability(token, staffId, pin.trim());
      if (result.error === "already_submitted") {
        setAlreadySubmitted(true);
      } else if (result.error) {
        setUnlockError(result.error === "invalid_pin" ? "That PIN doesn't match — try again." : "Something went wrong — try again.");
      } else {
        setSelections(new Set(result.existing || []));
        setNote(result.note || "");
        setUnlocked(true);
      }
    });
  }

  function toggle(dayId: string) {
    setSelections((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  }

  function submit() {
    setSubmitError(null);
    startSubmitTransition(async () => {
      const result = await submitAvailabilityFinal(token, staffId, pin.trim(), [...selections], note);
      if (result.error === "already_submitted") {
        setAlreadySubmitted(true);
        setUnlocked(false);
      } else if (result.error) {
        setSubmitError("Couldn't submit — please try again.");
      } else {
        setJustSubmitted(true);
      }
    });
  }

  return (
    <Card>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
          Who are you?
        </label>
        <select className="field-select" value={staffId} onChange={(e) => resetForNewPerson(e.target.value)}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {!unlocked && !alreadySubmitted && !justSubmitted && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
            Enter your PIN
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="field-input"
              style={{ maxWidth: 120 }}
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && unlock()}
            />
            <button className="btn-primary" disabled={unlockPending || pin.length === 0} onClick={unlock}>
              {unlockPending ? "Checking…" : "Continue"}
            </button>
          </div>
          {unlockError && <div style={{ fontSize: 12, color: "var(--bad)", fontWeight: 600, marginTop: 8 }}>{unlockError}</div>}
        </div>
      )}

      {alreadySubmitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
          <Lock size={14} /> {selectedStaff?.name} already submitted availability for this month. Contact the studio
          if something needs to change.
        </div>
      )}

      {justSubmitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--good)" }}>
          <CheckCircle2 size={16} /> Thanks, {selectedStaff?.name}! Your availability is submitted and locked in.
        </div>
      )}

      {unlocked && !justSubmitted && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10, marginTop: 14 }}>
            Tap every date you&apos;re available for, {selectedStaff?.name}:
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {pictureDays.map((pd) => {
              const isAvail = selections.has(pd.id);
              const { wd, md } = fmtDate(pd.date);
              return (
                <div key={pd.id} className={`chip ${isAvail ? "available" : ""}`} onClick={() => toggle(pd.id)}>
                  {isAvail ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {wd} {md}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>
              Anything we should know? (optional — scheduling preference, a hard-out time, etc.)
            </label>
            <textarea
              className="field-textarea"
              rows={3}
              placeholder="e.g. Please schedule me as much as possible, or: I have to leave by 2pm on the 13th."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--muted)" }}>
            Once you submit, you won&apos;t be able to come back and change it — double-check your dates first.
          </div>

          <button className="btn-primary" style={{ marginTop: 10 }} disabled={submitPending} onClick={submit}>
            {submitPending ? "Submitting…" : "Submit availability"}
          </button>
          {submitError && <div style={{ fontSize: 12, color: "var(--bad)", fontWeight: 600, marginTop: 8 }}>{submitError}</div>}
        </>
      )}
    </Card>
  );
}
