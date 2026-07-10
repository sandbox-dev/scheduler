import Link from "next/link";
import { LayoutList, CalendarRange, ChevronLeft, ChevronRight, Users, Download } from "lucide-react";
import {
  getApprovalForMonth,
  getAvailability,
  getJobs,
  getScheduleAssignments,
  getStaff,
  getStaffSchoolDistances,
} from "@/lib/data";
import {
  buildDistanceMap,
  buildStaffScheduleRows,
  distanceFor,
  flattenJobDays,
  fmtDate,
  isGroupPhotoSlot,
  jobDayPositions,
  neededDatesSummary,
  requiredQualificationsFor,
  roleCandidates,
} from "@/lib/scheduling";
import {
  addDays,
  getMonthGrid,
  getMonthsWithDates,
  getWeekGrid,
  mondayOf,
  monthLabel,
  pickDefaultMonth,
  selectableMonths,
  shiftWeek,
} from "@/lib/month";
import { Card, CategoryBadge, RoleTag, Stat } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { ROLES, type Role } from "@/lib/types";
import { GenerateButton } from "./GenerateButton";
import { PrintButton } from "./PrintButton";
import { ScheduleSlotCard } from "./ScheduleSlotCard";
import { CalendarView } from "./CalendarView";
import { ApproveButton } from "./ApproveButton";
import { LockJobButton } from "../jobs/LockJobButton";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; range?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : sp.view === "staff" ? "staff" : "list";
  const range = sp.range === "week" ? "week" : "month";
  const [jobs, staff, availability, assignments, staffSchoolDistances] = await Promise.all([
    getJobs(),
    getStaff(),
    getAvailability(),
    getScheduleAssignments(),
    getStaffSchoolDistances(),
  ]);

  const allNeeded = neededDatesSummary(jobs);
  const monthsWithData = getMonthsWithDates(allNeeded.map((n) => n.date));
  const month = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : pickDefaultMonth(monthsWithData);
  const needed = allNeeded.filter((n) => n.date.startsWith(month.slice(0, 7)));

  const defaultWeekStart = mondayOf(needed[0]?.date || month);
  const weekStart = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : defaultWeekStart;

  const approval = await getApprovalForMonth(month);

  const hasSchedule = assignments.length > 0;
  const distanceMap = buildDistanceMap(staffSchoolDistances);

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const availableSet = new Set(
    availability.filter((a) => a.available).map((a) => `${a.staff_id}_${a.picture_day_id}`)
  );

  const assignmentsByDay = new Map<string, typeof assignments>();
  assignments.forEach((a) => {
    const list = assignmentsByDay.get(a.picture_day_id) || [];
    list.push(a);
    assignmentsByDay.set(a.picture_day_id, list);
  });

  // Same-day double-booking: group every filled assignment by staff + date
  // (regardless of role or job) so we can flag a staff member scheduled more
  // than once on the same date — allowed temporarily while sorting things
  // out, but surfaced as a warning rather than silently accepted.
  const pictureDayDateById = new Map(needed.flatMap((n) => n.jobs.map((jd) => [jd.id, jd.date])));
  const pictureDayJobNameById = new Map(needed.flatMap((n) => n.jobs.map((jd) => [jd.id, jd.jobName])));
  const lockedJobIds = new Set(jobs.filter((j) => j.locked).map((j) => j.id));
  const staffDateAssignments = new Map<string, { assignmentId: string; jobName: string; role: Role }[]>();
  assignments.forEach((a) => {
    if (!a.staff_id) return;
    const date = pictureDayDateById.get(a.picture_day_id);
    if (!date) return;
    const key = `${a.staff_id}_${date}`;
    const list = staffDateAssignments.get(key) || [];
    list.push({ assignmentId: a.id, jobName: pictureDayJobNameById.get(a.picture_day_id) || "", role: a.role as Role });
    staffDateAssignments.set(key, list);
  });

  const pictureDayIdsThisMonth = new Set(needed.flatMap((n) => n.jobs.map((jd) => jd.id)));
  let filled = 0;
  let total = 0;
  assignments
    .filter((a) => pictureDayIdsThisMonth.has(a.picture_day_id))
    .forEach((a) => {
      total += 1;
      if (a.staff_id) filled += 1;
    });
  const hasScheduleThisMonth = total > 0;

  const rowsByStaffId = buildStaffScheduleRows(needed, assignmentsByDay, new Map());
  const staffWithAssignments = staff
    .filter((s) => (rowsByStaffId.get(s.id) || []).length > 0)
    .map((s) => ({ ...s, rows: rowsByStaffId.get(s.id) || [] }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="display" style={{ fontSize: 21, fontWeight: 800 }}>Schedule — {monthLabel(month)}</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Ranks available staff by seniority, then category match, then distance from the job.</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <MonthPicker month={month} months={selectableMonths(monthsWithData)} monthsWithData={monthsWithData} />
          <div style={{ display: "flex" }}>
            <Link
              href={`?month=${month}&view=list`}
              className={`tab-pill ${view === "list" ? "active" : ""}`}
              style={{ border: "1px solid var(--line)", borderRadius: "10px 0 0 10px", padding: "9px 13px" }}
            >
              <LayoutList size={14} /> List
            </Link>
            <Link
              href={`?month=${month}&view=calendar&range=${range}${range === "week" ? `&week=${weekStart}` : ""}`}
              className={`tab-pill ${view === "calendar" ? "active" : ""}`}
              style={{ border: "1px solid var(--line)", borderLeft: "none", padding: "9px 13px" }}
            >
              <CalendarRange size={14} /> Calendar
            </Link>
            <Link
              href={`?month=${month}&view=staff`}
              className={`tab-pill ${view === "staff" ? "active" : ""}`}
              style={{ border: "1px solid var(--line)", borderLeft: "none", borderRadius: "0 10px 10px 0", padding: "9px 13px" }}
            >
              <Users size={14} /> By Staff
            </Link>
          </div>
          <GenerateButton hasSchedule={hasSchedule} month={month} />
          <PrintButton weekStart={weekStart} />
        </div>
      </div>

      {view === "calendar" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex" }}>
            <Link
              href={`?month=${month}&view=calendar&range=month`}
              className={`tab-pill ${range === "month" ? "active" : ""}`}
              style={{ border: "1px solid var(--line)", borderRadius: "10px 0 0 10px", padding: "8px 13px", fontSize: 12.5 }}
            >
              Month
            </Link>
            <Link
              href={`?month=${month}&view=calendar&range=week&week=${weekStart}`}
              className={`tab-pill ${range === "week" ? "active" : ""}`}
              style={{ border: "1px solid var(--line)", borderLeft: "none", borderRadius: "0 10px 10px 0", padding: "8px 13px", fontSize: 12.5 }}
            >
              Week
            </Link>
          </div>

          {range === "week" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link
                href={`?month=${month}&view=calendar&range=week&week=${shiftWeek(weekStart, -1)}`}
                className="btn-secondary"
                style={{ padding: "7px 10px" }}
              >
                <ChevronLeft size={14} />
              </Link>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {fmtDate(weekStart).md} – {fmtDate(addDays(weekStart, 6)).md}
              </div>
              <Link
                href={`?month=${month}&view=calendar&range=week&week=${shiftWeek(weekStart, 1)}`}
                className="btn-secondary"
                style={{ padding: "7px 10px" }}
              >
                <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}

      {hasScheduleThisMonth && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 32 }}>
              <Stat label="Slots filled" value={`${filled} / ${total}`} />
              <Stat label="Unfilled slots" value={total - filled} />
            </div>
            <ApproveButton month={month} approvedAt={approval?.approved_at || null} />
          </div>
        </Card>
      )}

      {needed.length === 0 && view === "list" && (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>No Picture Days booked for {monthLabel(month)}.</div>
        </Card>
      )}

      {view === "staff" && !hasScheduleThisMonth && (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
            No schedule yet for {monthLabel(month)} — generate one first to see who&apos;s booked where.
          </div>
        </Card>
      )}

      {view === "staff" && hasScheduleThisMonth && (
        <>
          <div style={{ marginBottom: 16 }}>
            <a className="btn-secondary" href={`/api/schedule/csv?month=${month}`}>
              <Download size={14} /> Export CSV
            </a>
          </div>
          {staffWithAssignments.length === 0 && (
            <Card>
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>No one is assigned yet for {monthLabel(month)}.</div>
            </Card>
          )}
          {staffWithAssignments.map((s) => (
            <Card key={s.id} style={{ marginBottom: 14 }}>
              <div className="display" style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 10 }}>
                {s.name} <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>({s.rows.length} day{s.rows.length === 1 ? "" : "s"})</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Role</th>
                    <th>School</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, i) => {
                    const { wd, md } = fmtDate(r.date);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>
                          {wd} {md}
                        </td>
                        <td>{r.role}</td>
                        <td>{r.jobName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))}
        </>
      )}

      {view === "calendar" && (
        <CalendarView
          weeks={range === "week" ? [getWeekGrid(weekStart, month)] : getMonthGrid(month)}
          jobsByDate={new Map(allNeeded.map((n) => [n.date, n.jobs]))}
          assignmentsByDay={assignmentsByDay}
          hasScheduleThisMonth={hasScheduleThisMonth}
          staffNameById={new Map(staff.map((s) => [s.id, s.name]))}
          dayPositions={jobDayPositions(flattenJobDays(jobs))}
          month={month}
          weekMode={range === "week"}
        />
      )}

      {needed.length > 0 && view === "list" && !hasScheduleThisMonth && (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
            No schedule yet for {monthLabel(month)} — click &quot;Generate schedule&quot; to assign Photographers, Assistants,
            and Supervisors to every Picture Day.
          </div>
        </Card>
      )}

      {view === "list" &&
        hasScheduleThisMonth &&
        needed.map((n) => {
          const { wd, md } = fmtDate(n.date);
          return (
            <Card key={n.date} id={n.date} style={{ marginBottom: 14 }}>
              <div className="display" style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                {wd}, {md}
              </div>
              {n.jobs.map((jd) => {
                const dayAssignments = assignmentsByDay.get(jd.id) || [];
                return (
                  <div key={jd.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--bg)" }}>
                    <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <div className="display" style={{ fontSize: 19, fontWeight: 800 }}>{jd.jobName}</div>
                        {jd.schoolType && (
                          <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, marginTop: 2 }}>
                            {jd.schoolType}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                          <CategoryBadge category={jd.category} />
                          {jd.is_outdoor && <CategoryBadge category="Outdoor" />}
                        </div>
                      </div>
                      <LockJobButton jobId={jd.jobId} locked={lockedJobIds.has(jd.jobId)} />
                    </div>

                    {ROLES.filter((r) => jd.crew[r] > 0).map((role) => {
                      const roleRows = dayAssignments
                        .filter((a) => a.role === role)
                        .sort((a, b) => a.slot_index - b.slot_index);

                      return (
                        <div key={role} style={{ marginBottom: 10 }}>
                          <div style={{ marginBottom: 6 }}>
                            <RoleTag role={role as Role} extra={` (${jd.crew[role]})`} />
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {roleRows.map((a) => {
                              const s = a.staff_id ? staffById.get(a.staff_id) : null;
                              const required = requiredQualificationsFor(jd, role as Role, a.slot_index);
                              const options = roleCandidates(staff, role as Role).filter((o) =>
                                required.every((q) => o.categories.includes(q))
                              );
                              const isGroupSlot = isGroupPhotoSlot(jd, role as Role, a.slot_index);
                              const conflictEntries = s ? staffDateAssignments.get(`${s.id}_${jd.date}`) || [] : [];
                              const conflictWith = conflictEntries
                                .filter((e) => e.assignmentId !== a.id)
                                .map((e) => `${e.jobName} (${e.role})`);
                              return (
                                <ScheduleSlotCard
                                  key={a.id}
                                  pictureDayId={jd.id}
                                  jobId={jd.jobId}
                                  role={role as Role}
                                  slotIndex={a.slot_index}
                                  isGroupSlot={isGroupSlot}
                                  assignmentId={a.id}
                                  equipmentCase={a.equipment_case}
                                  conflictWith={conflictWith}
                                  locked={lockedJobIds.has(jd.jobId)}
                                  assigned={
                                    s
                                      ? {
                                          id: s.id,
                                          name: s.name,
                                          seniority: s.seniority,
                                          distance_miles: distanceFor(s, jd.schoolId, distanceMap),
                                          available: availableSet.has(`${s.id}_${jd.id}`),
                                        }
                                      : null
                                  }
                                  options={options.map((o) => ({
                                    id: o.id,
                                    name: o.name,
                                    seniority: o.seniority,
                                    distance_miles: distanceFor(o, jd.schoolId, distanceMap),
                                    available: availableSet.has(`${o.id}_${jd.id}`),
                                  }))}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </Card>
          );
        })}
    </div>
  );
}
