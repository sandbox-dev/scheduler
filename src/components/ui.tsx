import { Camera, ShieldCheck, Users } from "lucide-react";
import type { Role } from "@/lib/types";

export function Card({
  children,
  style,
  accent,
  id,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
  id?: string;
}) {
  return (
    <div id={id} className="card" style={{ ...(accent ? { borderTop: `3px solid ${accent}` } : {}), ...style }}>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="stat-num">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return <span className="pill pill-category">{category}</span>;
}

const ROLE_COLOR: Record<Role, string> = {
  Photographer: "var(--role-photographer)",
  Assistant: "var(--role-assistant)",
  Supervisor: "var(--role-supervisor)",
};
const ROLE_ICON: Record<Role, typeof Camera> = { Photographer: Camera, Assistant: Users, Supervisor: ShieldCheck };

export function RoleTag({ role, extra }: { role: Role; extra?: string }) {
  const Icon = ROLE_ICON[role];
  return (
    <span
      className="role-tag"
      style={{ background: `color-mix(in srgb, ${ROLE_COLOR[role]} 14%, white)`, color: ROLE_COLOR[role] }}
    >
      <Icon size={12} /> {role}
      {extra}
    </span>
  );
}
