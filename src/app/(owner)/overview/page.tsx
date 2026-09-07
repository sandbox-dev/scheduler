import Link from "next/link";
import { CalendarDays, Users, CheckCircle2, Award, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { getJobs, getStaff, getAvailability, getScheduleAssignments } from "@/lib/data";
import { flattenJobDays, jobDayPositions, neededDatesSummary, fmtDate } from "@/lib/scheduling";
import { addDays, getMonthsWithDates, getWeekGrid, mondayOf, monthLabel, pickDefaultMonth, selectableMonths, shiftWeek } from "@/lib/month";
import { Card, Stat } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { CalendarView } from "../schedule/CalendarView";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, availability, assignments] = await Promise.all([
    getJobs(),
    getStaff(),
    getAvailability(),
    getScheduleAssignments(),
  ]);

  const allNeeded = neededDatesSummary(jobs);
  const monthsWithData = getMonthsWithDates(allNeeded.map((n) => n.date));
  const month = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : pickDefaultMonth(monthsWithData);

  const needed = allNeeded.filter((n) => n.date.startsWith(month.slice(0, 7)));
  const jobsThisMonth = jobs.filter((j) => j.picture_days.some((d) => d.date.startsWith(month.slice(0, 7))));
  const totalSetups = needed.reduce((a, n) => a + n.totalSetups, 0);

  const pictureDayIdsThisMonth = new Set(needed.flatMap((n) => n.jobs.map((jd) => jd.id)));
  const staffIdsForMonth = new Set(
    availability.filter((a) => pictureDayIdsThisMonth.has(a.picture_day_id)).map((a) => a.staff_id)
  );
  const respondedCount = staff.filter((s) => staffIdsForMonth.has(s.id)).length;

  const daysNeedingReview = jobsThisMonth.reduce(
    (count, job) =>
      count + job.picture_days.filter((d) => d.date.startsWith(month.slice(0, 7)) && d.needs_review).length,
    0
  );

  const navCards = [
    { href: "/jobs", icon: CalendarDays, title: "Jobs", desc: "Import bookings and set setups per Picture Day." },
    { href: "/staff", icon: Users, title: "Staff", desc: "Roster, roles, and who can supervise." },
    { href: "/availability-tracker", icon: CheckCircle2, title: "Availability", desc: "Send dates and collect responses." },
    { href: "/schedule", icon: Award, title: "Schedule", desc: "Auto-assign by priority, category, distance." },
  ];

  // "Who's scheduled this week" — Adi, 2026-09-06: most visits to Scheduler
  // aren't to build a schedule, they're to check who's already on for the
  // current week, and that meant a detour through the Schedule page's own
  // month/week toggle every time. Defaults to today's real week, independent
  // of the month picker above, but its own prev/next arrows (added same day:
  // "can you add back and forth arrows so we can scroll to the next week or
  // backwards?") move it via a separate `week` query param — reuses the
  // Schedule page's own CalendarView in weekMode (same staffing-per-role
  // display), with linkBase="/schedule" so clicking a date or a job card
  // lands on the real Schedule page at that week/job instead of trying to
  // apply Schedule-only query params to this page.
  const todayIso = new Date().toISOString().slice(0, 10);
  const thisWeekStart = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : mondayOf(todayIso);
  // The Schedule page only accepts a "YYYY-MM-01" month param (its own
  // regex check) — thisWeekStart is a Monday, not necessarily the 1st, so
  // the links this widget generates need this instead, or the Schedule page
  // silently falls back to its own default month while still (correctly)
  // honoring the week= param.
  const thisWeekMonthParam = `${thisWeekStart.slice(0, 7)}-01`;
  // A standalone week has no surrounding "month" to compare against — every
  // day here should read as fully "in" the view, not dimmed the way a week
  // spilling over a month boundary would be on the Schedule page itself.
  const thisWeekGrid = getWeekGrid(thisWeekStart, thisWeekStart).map((d) => ({ ...d, inMonth: true }));
  const thisWeekDates = new Set(thisWeekGrid.map((d) => d.date));
  const thisWeekPictureDayIds = new Set(
    allNeeded.filter((n) => thisWeekDates.has(n.date)).flatMap((n) => n.jobs.map((jd) => jd.id))
  );
  const hasScheduleThisWeek = assignments.some((a) => thisWeekPictureDayIds.has(a.picture_day_id));
  const weekAssignmentsByDay = new Map<string, typeof assignments>();
  assignments.forEach((a) => {
    if (!thisWeekPictureDayIds.has(a.picture_day_id)) return;
    const list = weekAssignmentsByDay.get(a.picture_day_id) || [];
    list.push(a);
    weekAssignmentsByDay.set(a.picture_day_id, list);
  });

  return (
    <div>
      <Card accent="var(--navy)">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{monthLabel(month)}, At a Glance</div>
            <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Every job, every Picture Day, one clean view.</div>
          </div>
          <MonthPicker month={month} months={selectableMonths(monthsWithData)} monthsWithData={monthsWithData} />
        </div>
        <div style={{ display: "flex", gap: 32, marginTop: 20, flexWrap: "wrap" }}>
          <Stat label="Jobs booked" value={jobsThisMonth.length} />
          <Stat label="Picture Days" value={needed.length} />
          <Stat label="Total setups" value={totalSetups} />
          <Stat label="Staff responded" value={`${respondedCount} / ${staff.length}`} />
        </div>
      </Card>

      {daysNeedingReview > 0 && (
        <Link href="/jobs" style={{ textDecoration: "none", color: "inherit" }}>
          <Card style={{ marginTop: 16, borderTop: "3px solid var(--gold)", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
              <AlertTriangle size={16} color="var(--navy)" />
              {daysNeedingReview} Picture Day{daysNeedingReview === 1 ? "" : "s"} in {monthLabel(month)}{" "}
              {daysNeedingReview === 1 ? "needs" : "need"} setups confirmed — click to review on the Jobs page.
            </div>
          </Card>
        </Link>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginTop: 16 }}>
        {navCards.map((n) => (
          <Link key={n.href} href={n.href} style={{ textDecoration: "none", color: "inherit" }}>
            <Card style={{ cursor: "pointer", height: "100%" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--gold-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <n.icon size={16} color="var(--navy)" />
              </div>
              <div className="display" style={{ fontSize: 15, fontWeight: 700 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{n.desc}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 700 }}>
            This Week
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Link href={`?month=${month}&week=${shiftWeek(thisWeekStart, -1)}`} className="btn-secondary" style={{ padding: "4px 7px" }} title="Previous week">
              <ChevronLeft size={13} />
            </Link>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", minWidth: 120, textAlign: "center" }}>
              {fmtDate(thisWeekStart).md} – {fmtDate(addDays(thisWeekStart, 6)).md}
            </span>
            <Link href={`?month=${month}&week=${shiftWeek(thisWeekStart, 1)}`} className="btn-secondary" style={{ padding: "4px 7px" }} title="Next week">
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>
        <CalendarView
          weeks={[thisWeekGrid]}
          jobsByDate={new Map(allNeeded.filter((n) => thisWeekDates.has(n.date)).map((n) => [n.date, n.jobs]))}
          assignmentsByDay={weekAssignmentsByDay}
          hasScheduleThisMonth={hasScheduleThisWeek}
          staffNameById={new Map(staff.map((s) => [s.id, s.name]))}
          dayPositions={jobDayPositions(flattenJobDays(jobs))}
          month={thisWeekMonthParam}
          weekMode
          linkBase="/schedule"
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 700, marginBottom: 10 }}>
          Picture Days — {monthLabel(month)}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {needed.length === 0 && <div style={{ fontSize: 13.5, color: "var(--muted)" }}>No Picture Days booked for {monthLabel(month)}.</div>}
          {needed.map((n) => {
            const { wd, md } = fmtDate(n.date);
            return (
              <Card key={n.date} style={{ padding: 0 }}>
                <div className="day-tile">
                  <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, letterSpacing: "0.04em" }}>{wd.toUpperCase()}</div>
                  <div className="display" style={{ fontSize: 20, fontWeight: 800, margin: "2px 0" }}>{md}</div>
                  <div style={{ fontSize: 11.5, color: "var(--navy)", fontWeight: 700 }}>{n.totalSetups} setups</div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
