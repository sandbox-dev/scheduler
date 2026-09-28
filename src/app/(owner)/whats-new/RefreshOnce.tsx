"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Clears the tab's number after this page marks everything seen.
export function RefreshOnce() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
