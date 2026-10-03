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
} as const;

export type GearTone = keyof typeof GEAR_TAG_COLORS;

export function backdropTone(name: string): "ivy" | "gray" | "plain" {
  if (/ivy|green/i.test(name)) return "ivy";
  if (/gr[ae]y/i.test(name)) return "gray";
  return "plain";
}
