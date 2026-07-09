"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { generateAndSaveSchedule } from "./actions";

export function GenerateButton({ hasSchedule }: { hasSchedule: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button className="btn-primary" disabled={pending} onClick={() => startTransition(() => generateAndSaveSchedule())}>
      <Sparkles size={14} /> {pending ? "Generating…" : hasSchedule ? "Regenerate" : "Generate schedule"}
    </button>
  );
}
