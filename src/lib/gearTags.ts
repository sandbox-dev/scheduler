// Pill colors shared by the weekly print sheet and the team app (Adi,
// 2026-09-30: Indoor grey, Outdoor green, Babies pink; 2026-10-03: same pills
// in the team app "like we have on the schedule").
export const GEAR_TAG_COLORS = {
  plain: { bg: "#fff", border: "var(--line)", color: "var(--ink)" },
  indoor: { bg: "#E7E7EA", border: "#C9C9CF", color: "#3F3F46" },
  outdoor: { bg: "#DCEFE3", border: "#9CCBAE", color: "#1E6B43" },
  babies: { bg: "#F9DDE7", border: "#E7A6BD", color: "#9B2F57" },
  group: { bg: "#DDEAF8", border: "#9DBFE6", color: "#1F4E86" },
  // The two backdrops, in their own colors — solid, so they don't read as
  // the light Indoor/Outdoor tags (Adi, 2026-09-30: "we only have two
  // backdrops, gray and ivy wall").
  ivy: { bg: "#3F7A47", border: "#2F5E36", color: "#FFFFFF" },
  gray: { bg: "#7D8187", border: "#5F6368", color: "#FFFFFF" },
  // Added 2026-10-03 with the backdrop dropdown — Natural Setting tan,
  // Blue Skies light blue (Adi).
  natural: { bg: "#A47A4E", border: "#85613B", color: "#FFFFFF" },
  sky: { bg: "#BFE0F5", border: "#7DBBE3", color: "#154E75" },
} as const;

export type GearTone = keyof typeof GEAR_TAG_COLORS;

// Backdrops are picked from a list in The Sandbox now (Gray, Natural
// Setting, Ivy Wall, Blue Skies — src/lib/backdrops.ts there).
export function backdropTone(name: string): "ivy" | "gray" | "natural" | "sky" | "plain" {
  if (/ivy|green/i.test(name)) return "ivy";
  if (/gr[ae]y/i.test(name)) return "gray";
  if (/natural/i.test(name)) return "natural";
  if (/blue|sky/i.test(name)) return "sky";
  return "plain";
}
