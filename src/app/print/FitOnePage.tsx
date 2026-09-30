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

// The grid's own width is pinned to this (below) rather than measured, so
// it's always judged against the real printed page width — not whatever the
// browser window happens to be sized to on screen. Measuring the natural
// (unpinned) width instead caused this to shrink far more than necessary on
// a wide monitor: laid out that wide, the grid's rows wrap less and read as
// "shorter" than they actually are at print width, so the shrink computed
// from the screen-width measurement was way more aggressive than the page
// actually needed — found 2026-09-14 printing way too small on a real
// laptop screen.
const AVAILABLE_WIDTH_PX = (PAGE_WIDTH_IN - PAGE_MARGIN_IN * 2) * PX_PER_IN;
const AVAILABLE_HEIGHT_PX = (PAGE_HEIGHT_IN - PAGE_MARGIN_IN * 2) * PX_PER_IN * SAFETY_MARGIN;

export function FitOnePage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    // Shrinks only as much as it has to, and lays out WIDER as it shrinks so
    // the scaled sheet still fills the page's width (Adi, 2026-09-28: a day
    // with three schools printed narrow and tiny). Scaling alone shrank the
    // width too; here each step down gives the grid more room, which cuts
    // wrapping and height, so it usually fits at a much larger size.
    function recompute() {
      const el = ref.current;
      if (!el) return;
      // Measured unzoomed; the zoom is put back once the size is picked.
      el.style.zoom = "1";
      let s = 1;
      for (; s > 0.4; s -= 0.02) {
        el.style.width = `${AVAILABLE_WIDTH_PX / s}px`;
        if (el.scrollHeight * s <= AVAILABLE_HEIGHT_PX) break;
      }
      s = Math.max(s, 0.4);
      el.style.width = `${AVAILABLE_WIDTH_PX / s}px`;
      el.style.zoom = String(s);
      setScale(s);
    }
    recompute();
    // Re-checked right before the browser actually prints — a logo image or
    // web font can finish loading after the initial measurement and change
    // the real height, and this is the one moment that has to be right.
    // Also once the real font has loaded, and when the page switches into
    // print layout itself — measured only on screen, the printed sheet could
    // still run onto a second page (2026-09-30).
    document.fonts?.ready.then(recompute);
    const printQuery = window.matchMedia("print");
    const onPrintChange = (e: MediaQueryListEvent) => e.matches && recompute();
    printQuery.addEventListener?.("change", onPrintChange);
    window.addEventListener("beforeprint", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      printQuery.removeEventListener?.("change", onPrintChange);
      window.removeEventListener("beforeprint", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, []);

  return (
    <>
      {/* Printed: no side padding, the sheet centered on the page, and its
          colors kept even with Background graphics off, so the print looks
          like the preview (Adi, 2026-09-30). */}
      <style>{`@page { size: landscape; margin: ${PAGE_MARGIN_IN}in; } @media print { html, body { background: #fff !important; } .print-root { padding: 0 !important; } .print-root, .print-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }`}</style>
      {/* zoom, not transform: printers split pages by the real laid-out
          size, and a transform only changes how it's drawn — the printed
          sheet broke mid-card onto a second page (2026-09-30). */}
      <div style={{ width: AVAILABLE_WIDTH_PX, margin: "0 auto" }}>
        <div ref={ref} style={{ width: AVAILABLE_WIDTH_PX / scale, zoom: scale }}>
          {children}
        </div>
      </div>
    </>
  );
}
