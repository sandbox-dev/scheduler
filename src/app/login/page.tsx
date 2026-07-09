"use client";

import Image from "next/image";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card" style={{ width: 360 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <Image src="/logo.png" alt="Sandbox Photographers" width={140} height={56} style={{ objectFit: "contain" }} priority />
          <div className="display" style={{ fontSize: 15, fontWeight: 700, color: "var(--muted)" }}>Picture Day Scheduler</div>
        </div>

        <form action={formAction}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 5 }}>Email</label>
            <input className="field-input" type="email" name="email" autoComplete="email" required />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 5 }}>Password</label>
            <input className="field-input" type="password" name="password" autoComplete="current-password" required />
          </div>

          {state?.error && (
            <div style={{ color: "var(--bad)", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{state.error}</div>
          )}

          <button className="btn-primary" type="submit" disabled={pending} style={{ width: "100%", justifyContent: "center" }}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
