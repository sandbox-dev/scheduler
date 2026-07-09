"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";

export function PrintControls({ prevWeek, nextWeek, label }: { prevWeek: string; nextWeek: string; label: string }) {
  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#fff",
        padding: 8,
        borderRadius: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
      }}
    >
      <Link href={`/print?week=${prevWeek}`} className="btn-secondary" style={{ padding: "8px 10px" }}>
        <ChevronLeft size={14} />
      </Link>
      <div style={{ fontSize: 13, fontWeight: 700, minWidth: 130, textAlign: "center" }}>{label}</div>
      <Link href={`/print?week=${nextWeek}`} className="btn-secondary" style={{ padding: "8px 10px" }}>
        <ChevronRight size={14} />
      </Link>
      <button className="btn-primary" onClick={() => window.print()} style={{ marginLeft: 8 }}>
        <Printer size={14} /> Print
      </button>
    </div>
  );
}
