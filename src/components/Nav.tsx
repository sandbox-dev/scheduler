"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, CalendarDays, Users, CheckCircle2, Award, DollarSign, LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

const TABS = [
  { href: "/overview", label: "Overview", icon: Sparkles },
  { href: "/jobs", label: "Jobs", icon: CalendarDays },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/availability-tracker", label: "Availability", icon: CheckCircle2 },
  { href: "/schedule", label: "Schedule", icon: Award },
  { href: "/mileage", label: "Payroll", icon: DollarSign },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <div className="top-bar no-print">
      <div className="brand-row" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image src="/logo.png" alt="Sandbox Photographers" width={70} height={28} style={{ objectFit: "contain" }} priority />
          <div className="display" style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)" }}>Scheduler</div>
        </div>
        <form action={logout} style={{ justifySelf: "end" }}>
          <button className="btn-secondary" type="submit">
            <LogOut size={13} /> Sign out
          </button>
        </form>
      </div>
      <div className="tab-bar">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`tab-pill ${pathname.startsWith(t.href) ? "active" : ""}`}>
            <t.icon size={14} /> {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
