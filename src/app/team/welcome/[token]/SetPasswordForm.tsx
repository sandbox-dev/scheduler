"use client";

import { useState } from "react";
import { setTeamPassword } from "./actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("Please use at least 8 characters.");
    if (pw !== pw2) return setError("Those two passwords don't match.");
    setSaving(true);
    setError(null);
    const res = await setTeamPassword(token, pw);
    if (res && "error" in res) {
      setError(res.error);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ fontSize: 15, fontWeight: 600 }}>
        Choose a password
        <input className="field-input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ marginTop: 6, fontSize: 16 }} />
      </label>
      <label style={{ fontSize: 15, fontWeight: 600 }}>
        Type it again
        <input className="field-input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ marginTop: 6, fontSize: 16 }} />
      </label>
      {error && <div style={{ color: "var(--bad)", fontWeight: 600, fontSize: 14 }}>{error}</div>}
      <button className="btn-primary" type="submit" disabled={saving} style={{ justifyContent: "center", fontSize: 16, padding: "12px 0" }}>
        {saving ? "Setting up…" : "Set Password And Sign In"}
      </button>
    </form>
  );
}
