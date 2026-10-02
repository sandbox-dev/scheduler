"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut, Menu, MessageSquare, Phone, Settings } from "lucide-react";
import { logout } from "./login/actions";

const STUDIO_PHONE = "+19252225195";

// The team app's top bar, kept short (Adi, 2026-10-02: "i'm worried the card
// is going to be really messy"): a Studio button (call or text) and a ☰ menu
// for Settings and Sign Out.
export function TeamTopBar({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState<"studio" | "menu" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const menu: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: "calc(100% + 6px)",
    zIndex: 50,
    background: "#fff",
    border: "1px solid var(--line)",
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    padding: 6,
    minWidth: 170,
    display: "flex",
    flexDirection: "column",
  };
  const item: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 15,
    color: "var(--ink)",
    textDecoration: "none",
    background: "none",
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  };

  return (
    <div className="top-bar no-print">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 16 }}>
        <Link href="/team" style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none", minWidth: 0 }}>
          <Image src="/logo.png" alt="Sandbox Photographers" width={72} height={29} style={{ objectFit: "contain", flexShrink: 0 }} priority />
          <div className="display" style={{ fontSize: 18, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Hi, {firstName}</div>
        </Link>
        <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <button type="button" className="btn-primary" onClick={() => setOpen(open === "studio" ? null : "studio")}>
              <Phone size={13} /> Studio
            </button>
            {open === "studio" && (
              <div style={menu}>
                <a href={`tel:${STUDIO_PHONE}`} style={item}>
                  <Phone size={15} /> Call Studio
                </a>
                <a href={`sms:${STUDIO_PHONE}`} style={item}>
                  <MessageSquare size={15} /> Text Studio
                </a>
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button type="button" className="btn-secondary" aria-label="Menu" onClick={() => setOpen(open === "menu" ? null : "menu")} style={{ padding: "8px 10px" }}>
              <Menu size={16} />
            </button>
            {open === "menu" && (
              <div style={menu}>
                <Link href="/team/settings" style={item} onClick={() => setOpen(null)}>
                  <Settings size={15} /> Settings
                </Link>
                <form action={logout}>
                  <button type="submit" style={item}>
                    <LogOut size={15} /> Sign Out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
