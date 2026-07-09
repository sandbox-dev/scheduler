import Link from "next/link";
import { CalendarDays, Users, CheckCircle2, Award, AlertTriangle } from "lucide-react";
import { getJobs, getStaff, getAvailability } from "@/lib/data";
import { neededDatesSummary, fmtDate } from "@/lib/scheduling";
import { getMonthsWithDates, monthLabel, pickDefaultMonth, selectableMonths } from "@/lib/month";
import { Card, Stat } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, availability] = await Promise.all([getJobs(), getStaff(), getAvailability()]);

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
    { href: "/schedule", icon: Award, title: "Schedule", desc: "Auto-assign by seniority, category, distance." },
  ];

  return (
    <div>
      <Card accent="var(--navy)">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{monthLabel(month)}, at a glance</div>
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
