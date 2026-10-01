"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Staff } from "@/lib/types";
import { inviteToTeamApp, removeTeamAccess } from "./teamAccessActions";

// Team app access for one staff member (Adi, 2026-10-01): invite, resend,
// or remove. "Active" once they've set their password (the invite link is
// used up then).
export function TeamAppAccess({ staff }: { staff: Staff }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const linked = !!staff.auth_user_id;
  const waiting = linked && !!staff.team_invite_expires_at;
  const status = !linked ? null : waiting ? "Invited" : "Active";

  function run(fn: () => Promise<{ ok: true; message: string } | { error: string }>, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setNote(null);
    startTransition(async () => {
      const res = await fn();
      setNote("error" in res ? { ok: false, text: res.error } : { ok: true, text: res.message });
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      {status && (
        <span style={{ fontSize: 11, fontWeight: 700, color: status === "Active" ? "var(--good)" : "var(--navy)" }}>Team App: {status}</span>
      )}
      {/* Same link for a forgotten password once they're Active. */}
      {staff.email ? (
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          style={{ fontSize: 11.5, padding: "4px 9px" }}
          onClick={() =>
            run(
              () => inviteToTeamApp(staff.id),
              status === "Active"
                ? `Send ${staff.name} a link to reset their team app password?\n\nIt emails ${staff.email || "them"} a link to choose a new one (good for 14 days). Their current password keeps working until they do.`
                : `${waiting ? "Resend" : "Send"} ${staff.name} an invite to the team app?\n\nIt emails ${staff.email || "them"} a link to set a password (good for 14 days).`
            )
          }
        >
          {pending ? "Sending…" : status === "Active" ? "Send Password Reset" : waiting ? "Resend Invite" : "Invite To Team App"}
        </button>
      ) : null}
      {!staff.email && !linked && <span style={{ fontSize: 11, color: "var(--muted)" }}>Add an email to invite to the team app</span>}
      {linked && (
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          style={{ fontSize: 11.5, padding: "4px 9px" }}
          onClick={() => run(() => removeTeamAccess(staff.id), `Remove ${staff.name}'s team app access?\n\nTheir login is deleted right away. You can invite them again later.`)}
        >
          Remove Access
        </button>
      )}
      {note && <span style={{ fontSize: 11.5, fontWeight: 600, color: note.ok ? "var(--good)" : "var(--bad)" }}>{note.text}</span>}
    </div>
  );
}
