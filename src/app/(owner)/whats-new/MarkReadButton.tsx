"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markUpdatesRead } from "./actions";

export function MarkReadButton({ ids, label }: { ids: string[] | "all"; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={pending}
      style={{ fontSize: 11.5, padding: "2px 9px" }}
      onClick={() =>
        startTransition(async () => {
          await markUpdatesRead(ids);
          router.refresh();
        })
      }
    >
      {pending ? "…" : label}
    </button>
  );
}
