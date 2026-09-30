"use client";

import { useEffect, useState } from "react";

// A page left open while we put out an update can't save anymore — its saves
// point at code the new version replaced (a school's roster save in The
// Sandbox failed ~40 times this way, 2026-09-30). Same bar as The Sandbox's.
// This checks for a newer version when the page comes back into view (and
// every few minutes) and asks them to refresh BEFORE they get stuck.
const THIS_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

export function UpdateAvailableBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (THIS_BUILD === "dev") return;
    let stopped = false;
    async function check() {
      try {
        const res = await fetch("/api/build", { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        if (!stopped && build && build !== "dev" && build !== THIS_BUILD) setStale(true);
      } catch {
        // Offline or a hiccup — try again next time.
      }
    }
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 3 * 60 * 1000);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, []);

  if (!stale) return null;
  return (
    <div
      className="no-print"
      role="alert"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 16px",
        background: "#FFF4D6",
        borderBottom: "1px solid #E8CF86",
        color: "#5C4A12",
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      This page was just updated. Please refresh it before you keep going, so your changes save.
      <button type="button" className="btn-primary" onClick={() => window.location.reload()} style={{ padding: "5px 14px" }}>
        Refresh
      </button>
    </div>
  );
}
