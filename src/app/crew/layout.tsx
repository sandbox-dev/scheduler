import type { Metadata, Viewport } from "next";

// Scoped to just the /crew routes — this is the part of the app meant to be
// added to a phone's home screen (see app/manifest.ts), so it gets its own
// theme-color + "open without browser chrome" meta tags. The owner-facing
// (owner) routes are untouched.
export const metadata: Metadata = {
  title: "Your Picture Days — Sandbox Photographers",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sandbox",
  },
  // Next's appleWebApp option only emits the newer "mobile-web-app-capable"
  // tag — added directly here too, since it's the one older iOS Safari
  // versions actually check for standalone (no browser chrome) mode.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#3B5B6A",
};

export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "var(--bg)", minHeight: "100dvh" }}>{children}</div>;
}
