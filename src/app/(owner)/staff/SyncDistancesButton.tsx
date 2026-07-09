"use client";

import { useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { syncStaffSchoolDistances } from "./actions";

export function SyncDistancesButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn-secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            try {
              const result = await syncStaffSchoolDistances();
              const notes: string[] = [];
              if (result.skippedNoAddress.length > 0) {
                notes.push(`no address on file for: ${result.skippedNoAddress.join(", ")}`);
              }
              if (result.skippedNoLocation.length > 0) {
                notes.push(`no home city on file for: ${result.skippedNoLocation.join(", ")}`);
              }
              if (result.unresolvableAddresses.length > 0) {
                notes.push(`couldn't find directions for (check for typos): ${result.unresolvableAddresses.join(", ")}`);
              }
              setMessage(
                `Computed ${result.computed} new staff-to-school distance${result.computed === 1 ? "" : "s"}.` +
                  (notes.length > 0 ? ` Skipped — ${notes.join("; ")}.` : "")
              );
            } catch {
              setError("Couldn't sync distances — please try again.");
            }
          });
        }}
      >
        <MapPin size={13} /> {pending ? "Syncing…" : "Sync distances"}
      </button>
      {message && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, maxWidth: 480 }}>{message}</div>}
      {error && <div style={{ fontSize: 12, color: "var(--bad)", fontWeight: 600, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
