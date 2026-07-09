"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createAvailabilityLink } from "./actions";

export function GenerateLinkButton({ month }: { month: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn-primary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await createAvailabilityLink(month);
            } catch {
              setError("Couldn't generate a link — please try again.");
            }
          });
        }}
      >
        <Send size={14} /> {pending ? "Generating…" : "Generate this month's link"}
      </button>
      {error && <div style={{ color: "var(--bad)", fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
