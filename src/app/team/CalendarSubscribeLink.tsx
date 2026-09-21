"use client";

import { useState } from "react";
import { CalendarPlus, Copy, CheckCircle2 } from "lucide-react";

// Same copy-to-clipboard shape as CopyLinkBox
// (src/app/(owner)/availability-tracker/CopyLinkBox.tsx) — kept as its own
// small component here rather than importing that one, since this one also
// renders the primary "Add To Calendar" button above the copyable link and
// lives in a different route group ((owner) is server-only pages, /team is
// the staff-facing portal).
export function CalendarSubscribeLink({ httpsUrl }: { httpsUrl: string }) {
  const [copied, setCopied] = useState(false);
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");

  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
        Add once in your phone&apos;s Calendar app and your Picture Days stay up to date automatically — no need to
        check back here for changes.
      </div>
      <a
        href={webcalUrl}
        className="btn-secondary"
        style={{ width: "100%", justifyContent: "center", marginBottom: 8, background: "var(--navy)", color: "#fff", border: "none" }}
      >
        <CalendarPlus size={13} /> Add To Apple Or Google Calendar
      </a>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>
        Or copy this link and add it as a &quot;subscribe by URL&quot; calendar yourself:
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input className="field-input" readOnly value={httpsUrl} onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, fontSize: 12.5 }} />
        <button
          className="btn-secondary"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(httpsUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <CheckCircle2 size={13} color="var(--good)" /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
