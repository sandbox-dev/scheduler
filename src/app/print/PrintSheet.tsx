import Image from "next/image";
import type { getJobs, getScheduleAssignments, getStaff } from "@/lib/data";
import { flattenJobDays, fmtDate, isGroupPhotoSlot, jobDayPositions } from "@/lib/scheduling";
import { addDays, computeJobLanes, getWeekGrid, mondayOf, shiftWeek } from "@/lib/month";
import { PrintControls } from "./PrintControls";
import { FitOnePage } from "./FitOnePage";

const ROLE_COLOR: Record<string, string> = {
  Photographer: "var(--role-photographer)",
  Assistant: "var(--role-assistant)",
  Supervisor: "var(--role-supervisor)",
  Trainee: "var(--role-trainee)",
};

// The sheet itself, separate from the data fetch above.
export function PrintSheet({
  jobs,
  staff,
  assignments,
  week: weekParam,
  backdrops,
}: {
  jobs: Awaited<ReturnType<typeof getJobs>>;
  staff: Awaited<ReturnType<typeof getStaff>>;
  assignments: Awaited<ReturnType<typeof getScheduleAssignments>>;
  week?: string;
  // Scheduler job id → backdrop (from The Sandbox), for the Gear line.
  backdrops?: Map<string, string>;
}) {
  const sp = { week: weekParam };

  const allDays = flattenJobDays(jobs);
  const defaultWeekStart = mondayOf(
    allDays.filter((d) => d.date >= new Date().toISOString().slice(0, 10))[0]?.date ||
      allDays[0]?.date ||
      new Date().toISOString().slice(0, 10)
  );
  const weekStart = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : defaultWeekStart;
  const week = getWeekGrid(weekStart, weekStart);

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const assignmentsByDay = new Map<string, typeof assignments>();
  assignments.forEach((a) => {
    const list = assignmentsByDay.get(a.picture_day_id) || [];
    list.push(a);
    assignmentsByDay.set(a.picture_day_id, list);
  });

  const weekDates = new Set(week.map((d) => d.date));
  const jobsByDate = new Map<string, typeof allDays>();
  allDays
    .filter((jd) => weekDates.has(jd.date))
    .forEach((jd) => {
      const list = jobsByDate.get(jd.date) || [];
      list.push(jd);
      jobsByDate.set(jd.date, list);
    });

  const jobIdsByDate = new Map(week.map((d) => [d.date, (jobsByDate.get(d.date) || []).map((jd) => jd.jobId)]));
  const laneOf = computeJobLanes(week, jobIdsByDate);
  const maxLane = Math.max(0, ...[...laneOf.values()]);
  const dayPositions = jobDayPositions(allDays);

  const hasSchedule = assignments.length > 0;

  function namesFor(pictureDayId: string, role: string) {
    return (assignmentsByDay.get(pictureDayId) || [])
      .filter((a) => a.role === role)
      .map((a) => (a.staff_id ? staffById.get(a.staff_id)?.name : null))
      .filter((name): name is string => !!name);
  }

  // Each Photographer gets their own row + case number (a multi-setup day
  // sends out one case per photographer, not one for the whole day).
  // Each photographer as "Name — Case N", with the day's dedicated group
  // photographer split out (Adi, 2026-09-28: the sheet "just says
  // photographer").
  function photographerRowsFor(jd: (typeof allDays)[number]) {
    return (assignmentsByDay.get(jd.id) || [])
      .filter((a) => a.role === "Photographer")
      .sort((a, b) => a.slot_index - b.slot_index)
      .map((a) => ({
        label: `${a.staff_id ? staffById.get(a.staff_id)?.name || "unfilled" : "unfilled"}${a.equipment_case ? ` — Case ${a.equipment_case}` : ""}`,
        isGroup: isGroupPhotoSlot(jd, "Photographer", a.slot_index),
      }));
  }

  // A job with Babies on any of its days needs baby gear every day.
  const babiesJobs = new Set(allDays.filter((d) => d.is_babies).map((d) => d.jobId));

  // Days with no picture days get a narrow column, so busy days get the
  // width (Adi, 2026-09-28: three schools in one day printed tiny).
  const busy = week.map((d) => (jobsByDate.get(d.date) || []).length > 0);

  return (
    <div className="print-root" style={{ padding: "28px 30px", fontFamily: "Inter, sans-serif", color: "var(--ink)", background: "#fff" }}>
      <PrintControls
        prevWeek={shiftWeek(weekStart, -1)}
        nextWeek={shiftWeek(weekStart, 1)}
        label={`${fmtDate(weekStart).md} – ${fmtDate(addDays(weekStart, 6)).md}`}
      />

      <FitOnePage>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginBottom: 22,
          paddingBottom: 18,
          borderBottom: "2px solid var(--purple)",
        }}
      >
        <Image
          src="/logo.png"
          alt="Sandbox Photographers"
          width={130}
          height={52}
          style={{ objectFit: "contain", marginBottom: 10 }}
          priority
        />
        <div className="display" style={{ fontSize: 30, fontWeight: 800, color: "var(--navy)", letterSpacing: "-0.01em" }}>
          {fmtDate(weekStart).md} – {fmtDate(addDays(weekStart, 6)).md}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, marginTop: 4 }}>
          Weekly Schedule
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: busy.map((b) => (b ? "1fr" : "0.35fr")).join(" "),
          gridTemplateRows: `auto repeat(${maxLane + 1}, auto)`,
          border: "1px solid var(--line)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {week.map((day, i) => {
          const { wd, md } = fmtDate(day.date);
          return (
            <div
              key={`header-${day.date}`}
              className="display"
              style={{
                gridColumn: i + 1,
                gridRow: 1,
                borderRight: i < 6 ? "1px solid var(--line)" : "none",
                borderBottom: "1px solid var(--line)",
                padding: "9px 10px",
                fontSize: "12pt",
                fontWeight: 700,
                color: "var(--navy)",
                background: "var(--purple)",
                textAlign: "center",
              }}
            >
              {wd.toUpperCase()} {md}
            </div>
          );
        })}

        {/* Column backgrounds so empty lane gaps still show grid lines */}
        {week.map((day, i) => (
          <div
            key={`col-${day.date}`}
            style={{
              gridColumn: i + 1,
              gridRow: `2 / span ${maxLane + 1}`,
              borderRight: i < 6 ? "1px solid var(--line)" : "none",
              background: "#fff",
            }}
          />
        ))}

        {week.map((day, i) =>
          (jobsByDate.get(day.date) || []).map((jd) => {
            const lane = laneOf.get(jd.jobId) ?? 0;
            const photographerRows = photographerRowsFor(jd);
            const regular = photographerRows.filter((r) => !r.isGroup);
            const group = photographerRows.filter((r) => r.isGroup);
            const assistants = namesFor(jd.id, "Assistant");
            const supervisors = namesFor(jd.id, "Supervisor");
            const trainees = namesFor(jd.id, "Trainee");
            return (
              <div
                key={jd.id}
                style={{
                  gridColumn: i + 1,
                  gridRow: lane + 2,
                  margin: 4,
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  borderTop: `3px solid ${jd.is_outdoor ? "var(--outdoor)" : "var(--indoor)"}`,
                  background: "var(--surface)",
                  fontSize: "10.5pt",
                  lineHeight: 1.5,
                }}
              >
                <div className="display" style={{ fontWeight: 700, fontSize: "11pt" }}>
                  {jd.jobName}
                  {(dayPositions.get(jd.id)?.total ?? 1) > 1 && (
                    <span style={{ fontWeight: 600, color: "var(--muted)" }}>
                      {" "}
                      (Day {dayPositions.get(jd.id)!.index} of {dayPositions.get(jd.id)!.total})
                    </span>
                  )}
                </div>
                <div style={{ color: "var(--muted)" }}>
                  {jd.schoolType}
                  {jd.setups ? `${jd.schoolType ? " · " : ""}${jd.setups} setup${jd.setups === 1 ? "" : "s"}` : ""}
                  {jd.enrollment ? ` · ${jd.enrollment} students` : ""}
                </div>
                {jd.has_group_photo && <div style={{ color: "var(--muted)" }}>+ Group photo</div>}
                {/* Gear for the week (Adi, 2026-09-30: "we use that to get
                    gear ready for the week"): backdrop, indoor/outdoor, and
                    Babies — for the whole job, since Babies on one day
                    covers the job. */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "3px 0 1px" }}>
                  {backdrops?.get(jd.jobId) && <GearTag>Backdrop: {backdrops.get(jd.jobId)}</GearTag>}
                  <GearTag tone={jd.is_outdoor ? "outdoor" : "indoor"}>{jd.is_outdoor ? "Outdoor" : "Indoor"}</GearTag>
                  {babiesJobs.has(jd.jobId) && <GearTag tone="babies">Babies</GearTag>}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ color: ROLE_COLOR.Photographer, fontWeight: 700 }}>Photographer:</span>{" "}
                  {hasSchedule ? (regular.length ? <NoBreakList items={regular.map((r) => r.label)} /> : "unfilled") : jd.crew.Photographer - (jd.has_group_photo ? 1 : 0)}
                </div>
                {jd.has_group_photo && (
                  <div>
                    <span style={{ color: ROLE_COLOR.Photographer, fontWeight: 700 }}>Group Photographer:</span>{" "}
                    {hasSchedule ? (group.length ? <NoBreakList items={group.map((r) => r.label)} /> : "unfilled") : 1}
                  </div>
                )}
                {jd.crew.Assistant > 0 && (
                  <div>
                    <span style={{ color: ROLE_COLOR.Assistant, fontWeight: 700 }}>Assistant:</span>{" "}
                    {hasSchedule ? assistants.join(", ") || "unfilled" : jd.crew.Assistant}
                  </div>
                )}
                {jd.crew.Supervisor > 0 && (
                  <div>
                    <span style={{ color: ROLE_COLOR.Supervisor, fontWeight: 700 }}>Supervisor:</span>{" "}
                    {hasSchedule ? supervisors.join(", ") || "unfilled" : jd.crew.Supervisor}
                  </div>
                )}
                {jd.crew.Trainee > 0 && (
                  <div>
                    <span style={{ color: ROLE_COLOR.Trainee, fontWeight: 700 }}>Trainee:</span>{" "}
                    {hasSchedule ? trainees.join(", ") || "unfilled" : jd.crew.Trainee}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: "10pt", color: "var(--muted)", fontWeight: 600 }}>
        <span style={{ borderTop: "3px solid var(--outdoor)", paddingTop: 3, marginRight: 18 }}>Outdoor</span>
        <span style={{ borderTop: "3px solid var(--indoor)", paddingTop: 3 }}>Indoor</span>
      </div>
      </FitOnePage>
    </div>
  );
}

// Each "Name — Case N" stays on one line — it only wraps between people
// (Adi, 2026-09-28: "(Case" and "1)" were splitting).
function NoBreakList({ items }: { items: string[] }) {
  return (
    <>
      {items.map((t, i) => (
        <span key={i}>
          <span style={{ whiteSpace: "nowrap" }}>{t}</span>
          {i < items.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}

// Adi, 2026-09-30: Indoor grey, Outdoor green, Babies pink. Fills print
// because the sheet forces print colors (see FitOnePage).
const GEAR_TAG_COLORS = {
  plain: { bg: "#fff", border: "var(--line)", color: "var(--ink)" },
  indoor: { bg: "#E7E7EA", border: "#C9C9CF", color: "#3F3F46" },
  outdoor: { bg: "#DCEFE3", border: "#9CCBAE", color: "#1E6B43" },
  babies: { bg: "#F9DDE7", border: "#E7A6BD", color: "#9B2F57" },
} as const;

function GearTag({ children, tone = "plain" }: { children: React.ReactNode; tone?: keyof typeof GEAR_TAG_COLORS }) {
  const c = GEAR_TAG_COLORS[tone];
  return (
    <span
      style={{
        fontSize: "9.5pt",
        fontWeight: tone === "plain" ? 600 : 700,
        padding: "0 8px",
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.bg,
        color: c.color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
