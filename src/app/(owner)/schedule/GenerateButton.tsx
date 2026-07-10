"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { generateAndSaveSchedule } from "./actions";

export function GenerateButton({ hasSchedule, month }: { hasSchedule: boolean; month: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="btn-primary"
      disabled={pending}
      onClick={() => startTransition(() => generateAndSaveSchedule(month))}
      title="Skips any locked jobs"
    >
      <Sparkles size={14} /> {pending ? "Generating…" : hasSchedule ? "Regenerate" : "Generate schedule"}
    </button>
  );
}
