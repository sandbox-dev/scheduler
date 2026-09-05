"use client";

import { useEffect, useRef, useState } from "react";

// Adi, 2026-09-05: "weekly print should always print one page" — a busy
// week (many overlapping jobs -> many lanes in the grid, page.tsx's
// `gridTemplateRows`) can be taller than one printed page, and a wide roster
// per job can be wider than one too. Rather than guess where a page break
// should fall (the same kind of JS height-estimate that timeline-builder's
// own AGENTS.md warns is unreliable), this shrinks the WHOLE grid down with
// a CSS transform until it's guaranteed to fit — no guess about where
// content breaks, just "is it small enough yet."
//
// `@page { size: landscape }` (this page's own <style> tag below) gives the
// scale far more room to work with than portrait's narrower page before it
// has to shrink text to the point of being unreadable.
const PAGE_WIDTH_IN = 11;
const PAGE_HEIGHT_IN = 8.5;
const PAGE_MARGIN_IN = 0.35;
const PX_PER_IN = 96;
// A little slack under the raw page math — a hair smaller than strictly
// necessary is a fine trade for never spilling to a second page, which is
// the one failure mode that actually matters here.
const SAFETY_MARGIN = 0.96;

export function FitOnePage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    function recompute() {
      const el = ref.current;
      if (!el) return;
      const { scrollWidth, scrollHeight } = el;
      setNaturalSize({ width: scrollWidth, height: scrollHeight });
      const availableWidthPx = (PAGE_WIDTH_IN - PAGE_MARGIN_IN * 2) * PX_PER_IN * SAFETY_MARGIN;
      const availableHeightPx = (PAGE_HEIGHT_IN - PAGE_MARGIN_IN * 2) * PX_PER_IN * SAFETY_MARGIN;
      const next = Math.min(1, availableWidthPx / scrollWidth, availableHeightPx / scrollHeight);
      setScale(next);
    }
    recompute();
    // Re-checked right before the browser actually prints — a logo image or
    // web font can finish loading after the initial measurement and change
    // the real height, and this is the one moment that has to be right.
    window.addEventListener("beforeprint", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("beforeprint", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

  return (
    <>
      <style>{`@page { size: landscape; margin: ${PAGE_MARGIN_IN}in; }`}</style>
      {/* Outer box reserves only the SHRUNK footprint in normal document
          flow — transform alone doesn't do this, it only changes how the
          element paints, so without an explicit height here the original
          (unscaled) space stays reserved and a mostly-blank second page
          follows anyway. */}
      <div style={naturalSize ? { width: naturalSize.width * scale, height: naturalSize.height * scale } : undefined}>
        <div ref={ref} style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </>
  );
}
