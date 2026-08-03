import { Camera, ShieldCheck, Users, GraduationCap } from "lucide-react";
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
  Trainee: "var(--role-trainee)",
};
const ROLE_ICON: Record<Role, typeof Camera> = {
  Photographer: Camera,
  Assistant: Users,
  Supervisor: ShieldCheck,
  Trainee: GraduationCap,
};

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

// Button version of RoleTag/CategoryBadge-style pills, for places a plain
// checkbox would look out of place (e.g. the Staff page) — same "off"
// look as the shared .chip class, filled in the role's own color when on.
export function RoleToggleChip({ role, active, onClick }: { role: Role; active: boolean; onClick: () => void }) {
  const Icon = ROLE_ICON[role];
  const color = ROLE_COLOR[role];
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip"
      style={
        active
          ? { background: `color-mix(in srgb, ${color} 16%, white)`, color, borderColor: `color-mix(in srgb, ${color} 45%, white)` }
          : undefined
      }
    >
      <Icon size={12} /> {role}
    </button>
  );
}

// "Photography" is dropped from the label here — it's implied by context
// (Qualified Categories) and dropping it lets every chip share one fixed
// width instead of stretching to fit "Outdoor Photography"/"Group
// Photography". Display-only: the actual stored qualification string
// (e.g. "Outdoor Photography") is untouched — callers still key/toggle on
// that full value, this component just renders it shorter.
export function CategoryToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const display = label.replace(/ Photography$/, "");
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip"
      style={{
        width: 88,
        justifyContent: "center",
        ...(active ? { background: "var(--gold-tint)", color: "var(--navy)", borderColor: "var(--gold)" } : {}),
      }}
    >
      {display}
    </button>
  );
}
