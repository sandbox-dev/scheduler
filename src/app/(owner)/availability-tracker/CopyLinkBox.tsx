"use client";

import { useState } from "react";
import { Copy, CheckCircle2 } from "lucide-react";

export function CopyLinkBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="field-input" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button
        className="btn-secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <CheckCircle2 size={13} color="var(--good)" /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
