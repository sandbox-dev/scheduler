"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, CalendarDays, Users, CheckCircle2, Award, DollarSign, LogOut, Megaphone } from "lucide-react";
import { logout } from "@/app/login/actions";
import { NEW_TAG_STYLE } from "@/app/(owner)/whats-new/newTagStyle";

const TABS = [
  { href: "/overview", label: "Overview", icon: Sparkles },
  { href: "/jobs", label: "Jobs", icon: CalendarDays },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/availability-tracker", label: "Availability", icon: CheckCircle2 },
  { href: "/schedule", label: "Schedule", icon: Award },
  { href: "/mileage", label: "Payroll", icon: DollarSign },
  { href: "/whats-new", label: "What's New", icon: Megaphone },
];

export function Nav({ unseenUpdates = 0 }: { unseenUpdates?: number }) {
  const pathname = usePathname();

  return (
    <div className="top-bar no-print">
      <div className="brand-row">
        <Image src="/logo.png" alt="Sandbox Photographers" width={70} height={28} style={{ objectFit: "contain" }} priority />
        <div className="display" style={{ fontSize: 22, fontWeight: 800, color: "var(--navy)", textAlign: "center" }}>Scheduler</div>
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
            {t.href === "/whats-new" && unseenUpdates > 0 && (
              <span style={{ ...NEW_TAG_STYLE, fontSize: 10.5, padding: "0 6px", marginLeft: 2 }}>
                {unseenUpdates}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
