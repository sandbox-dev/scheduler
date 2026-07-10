import Image from "next/image";
import { getJobs, getScheduleAssignments, getStaff } from "@/lib/data";
import { flattenJobDays, fmtDate, jobDayPositions } from "@/lib/scheduling";
import { addDays, computeJobLanes, getWeekGrid, mondayOf, shiftWeek } from "@/lib/month";
import { PrintControls } from "./PrintControls";

const ROLE_COLOR: Record<string, string> = {
  Photographer: "var(--role-photographer)",
  Assistant: "var(--role-assistant)",
  Supervisor: "var(--role-supervisor)",
};

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, assignments] = await Promise.all([getJobs(), getStaff(), getScheduleAssignments()]);

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
  function photographerRowsFor(pictureDayId: string) {
    return (assignmentsByDay.get(pictureDayId) || [])
      .filter((a) => a.role === "Photographer")
      .sort((a, b) => a.slot_index - b.slot_index)
      .map((a) => ({
        name: a.staff_id ? staffById.get(a.staff_id)?.name || "unfilled" : "unfilled",
        equipmentCase: a.equipment_case,
      }));
  }

  return (
    <div style={{ padding: "28px 30px", fontFamily: "Inter, sans-serif", color: "var(--ink)", background: "#fff" }}>
      <PrintControls
        prevWeek={shiftWeek(weekStart, -1)}
        nextWeek={shiftWeek(weekStart, 1)}
        label={`${fmtDate(weekStart).md} – ${fmtDate(addDays(weekStart, 6)).md}`}
      />

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
          gridTemplateColumns: "repeat(7, 1fr)",
          gridTemplateRows: `auto repeat(${maxLane + 1}, minmax(170px, auto))`,
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
            const photographerRows = photographerRowsFor(jd.id);
            const assistants = namesFor(jd.id, "Assistant");
            const supervisors = namesFor(jd.id, "Supervisor");
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
                <div style={{ color: "var(--muted)" }}>
                  {[jd.is_outdoor && "Outdoor", jd.has_group_photo && "+ Group photo"].filter(Boolean).join(", ")}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ color: ROLE_COLOR.Photographer, fontWeight: 700 }}>Photographer:</span>
                  {hasSchedule ? (
                    photographerRows.length > 0 ? (
                      photographerRows.map((r, i) => (
                        <div key={i} style={{ marginLeft: 6 }}>
                          {r.name}
                          {r.equipmentCase && ` — Case: ${r.equipmentCase}`}
                        </div>
                      ))
                    ) : (
                      <span> unfilled</span>
                    )
                  ) : (
                    <span> {jd.crew.Photographer}</span>
                  )}
                </div>
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
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: "10pt", color: "var(--muted)", fontWeight: 600 }}>
        <span style={{ borderTop: "3px solid var(--outdoor)", paddingTop: 3, marginRight: 18 }}>Outdoor</span>
        <span style={{ borderTop: "3px solid var(--indoor)", paddingTop: 3 }}>Indoor</span>
      </div>
    </div>
  );
}
