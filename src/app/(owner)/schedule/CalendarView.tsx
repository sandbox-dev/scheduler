import Link from "next/link";
import type { CalendarDay } from "@/lib/month";
import { computeJobLanes } from "@/lib/month";
import type { FlatJobDay } from "@/lib/scheduling";
import type { ScheduleAssignment } from "@/lib/types";
import { ROLES, type Role } from "@/lib/types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROLE_LABEL: Record<Role, string> = { Photographer: "Photographer", Assistant: "Assistant", Supervisor: "Supervisor" };
const ROLE_COLOR: Record<Role, string> = {
  Photographer: "var(--role-photographer)",
  Assistant: "var(--role-assistant)",
  Supervisor: "var(--role-supervisor)",
};

export function CalendarView({
  weeks,
  jobsByDate,
  assignmentsByDay,
  hasScheduleThisMonth,
  staffNameById,
  dayPositions,
  month,
  weekMode,
}: {
  weeks: CalendarDay[][];
  jobsByDate: Map<string, FlatJobDay[]>;
  assignmentsByDay: Map<string, ScheduleAssignment[]>;
  hasScheduleThisMonth: boolean;
  staffNameById: Map<string, string>;
  dayPositions: Map<string, { index: number; total: number }>;
  month: string;
  weekMode?: boolean;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--line)" }}>
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}
          >
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const jobIdsByDate = new Map(week.map((d) => [d.date, (jobsByDate.get(d.date) || []).map((jd) => jd.jobId)]));
        const laneOf = computeJobLanes(week, jobIdsByDate);
        const maxLane = Math.max(0, ...[...laneOf.values()]);
        const laneHeight = weekMode ? 92 : 54;

        return (
          <div
            key={wi}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gridTemplateRows: `auto repeat(${maxLane + 1}, minmax(${laneHeight}px, auto))`,
              borderBottom: wi < weeks.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            {week.map((day, i) => (
              <div
                key={`num-${day.date}`}
                style={{
                  gridColumn: i + 1,
                  gridRow: 1,
                  padding: "6px 6px 2px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--muted)",
                }}
              >
                {Number(day.date.slice(8, 10))}
              </div>
            ))}

            {/* Column backgrounds so empty lane gaps still show grid lines / out-of-month shading */}
            {week.map((day, i) => (
              <div
                key={`col-${day.date}`}
                style={{
                  gridColumn: i + 1,
                  gridRow: `2 / span ${maxLane + 1}`,
                  minWidth: 0,
                  borderRight: i < 6 ? "1px solid var(--line)" : "none",
                  background: day.inMonth ? "var(--surface)" : "var(--bg)",
                  opacity: day.inMonth ? 1 : 0.5,
                }}
              />
            ))}

            {week.map((day, i) =>
              (jobsByDate.get(day.date) || []).map((jd) => {
                const lane = laneOf.get(jd.jobId) ?? 0;
                const dayAssignments = assignmentsByDay.get(jd.id) || [];
                return (
                  <Link
                    key={jd.id}
                    href={`?month=${month}&view=list#${day.date}`}
                    style={{
                      gridColumn: i + 1,
                      gridRow: lane + 2,
                      textDecoration: "none",
                      color: "inherit",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        background: "var(--bg)",
                        borderRadius: 6,
                        borderTop: `3px solid ${jd.is_outdoor ? "var(--outdoor)" : "var(--indoor)"}`,
                        padding: "4px 6px",
                        margin: "2px 4px",
                        fontSize: 10.5,
                        lineHeight: 1.4,
                        minWidth: 0,
                        height: "calc(100% - 4px)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--ink)",
                          ...(weekMode
                            ? { overflowWrap: "break-word" }
                            : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
                        }}
                      >
                        {jd.jobName}
                        {weekMode && (dayPositions.get(jd.id)?.total ?? 1) > 1 && (
                          <span style={{ fontWeight: 600, color: "var(--muted)" }}>
                            {" "}
                            (Day {dayPositions.get(jd.id)!.index} of {dayPositions.get(jd.id)!.total})
                          </span>
                        )}
                      </div>
                      {weekMode && (
                        <div style={{ color: "var(--muted)", fontSize: 10 }}>
                          {[jd.schoolType, `${jd.setups} setup${jd.setups === 1 ? "" : "s"}`]
                            .filter(Boolean)
                            .join(" · ")}
                          {(jd.is_outdoor || jd.has_group_photo) && (
                            <span>
                              {" "}
                              · {[jd.is_outdoor && "Outdoor", jd.has_group_photo && "+Group"].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                        {ROLES.filter((r) => jd.crew[r] > 0).map((r) => {
                          const names = dayAssignments
                            .filter((a) => a.role === r && a.staff_id)
                            .map((a) => staffNameById.get(a.staff_id!))
                            .filter((n): n is string => !!n);
                          const filled = names.length;
                          return (
                            <span key={r} style={{ color: ROLE_COLOR[r] }}>
                              <b>{ROLE_LABEL[r]}:</b>{" "}
                              {weekMode && hasScheduleThisMonth
                                ? names.join(", ") || "unfilled"
                                : hasScheduleThisMonth
                                  ? `${filled}/${jd.crew[r]}`
                                  : jd.crew[r]}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, padding: "10px 12px", fontSize: 10.5, color: "var(--muted)" }}>
        <span style={{ borderTop: "3px solid var(--outdoor)", paddingTop: 3 }}>Outdoor</span>
        <span style={{ borderTop: "3px solid var(--indoor)", paddingTop: 3 }}>Indoor</span>
      </div>
    </div>
  );
}
