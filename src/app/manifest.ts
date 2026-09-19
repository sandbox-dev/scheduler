import type { MetadataRoute } from "next";

// Lets the mobile staff view (/crew) be added to a phone's home screen as
// its own app icon that opens straight to the schedule, no browser chrome.
// iOS Safari's actual home-screen icon comes from apple-icon.png (Next's
// file-based convention, already served app-wide) — this manifest mainly
// covers Android/Chrome's install prompt and the app's name/colors.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sandbox Photographers",
    short_name: "Sandbox",
    description: "Your upcoming Picture Days — school, address, and times.",
    start_url: "/crew",
    display: "standalone",
    background_color: "#F2EFEC",
    theme_color: "#3B5B6A",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
