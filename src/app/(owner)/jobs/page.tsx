import { AlertTriangle } from "lucide-react";
import { getJobs, getSchools } from "@/lib/data";
import { flattenJobDays } from "@/lib/scheduling";
import { getMonthsWithDates, monthLabel, pickDefaultMonth, selectableMonths } from "@/lib/month";
import { Card, CategoryBadge } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { JobForm } from "./JobForm";
import { DayRow } from "./DayRow";
import { RemoveJobButton } from "./RemoveJobButton";
import { SchoolRow } from "./SchoolRow";
import { SchoolTypeInput } from "./SchoolTypeInput";
import { EnrollmentInput } from "./EnrollmentInput";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, schools] = await Promise.all([getJobs(), getSchools()]);

  const monthsWithData = getMonthsWithDates(flattenJobDays(jobs).map((jd) => jd.date));
  const month = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : pickDefaultMonth(monthsWithData);

  const jobsThisMonth = jobs.filter((job) =>
    job.picture_days.some((d) => d.date.startsWith(month.slice(0, 7)))
  );

  const daysNeedingReviewThisMonth = jobsThisMonth.reduce(
    (count, job) =>
      count + job.picture_days.filter((d) => d.date.startsWith(month.slice(0, 7)) && d.needs_review).length,
    0
  );

  const schoolsNeedingAddressAttention = schools.filter((s) => !s.address.trim() || s.address_unresolvable);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <div className="display" style={{ fontSize: 21, fontWeight: 800 }}>{monthLabel(month)}</div>
        <MonthPicker month={month} months={selectableMonths(monthsWithData)} monthsWithData={monthsWithData} />
      </div>
      <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16 }}>
        Paste rows straight from your spreadsheet. Each row is a Picture Day: date, then setups needed. Adding a job
        always works regardless of the month selected above — it&apos;ll show up under whichever month its dates fall
        in.
      </div>

      <JobForm schools={schools} />

      {daysNeedingReviewThisMonth > 0 && (
        <Card style={{ marginBottom: 20, borderTop: "3px solid var(--gold)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
            <AlertTriangle size={16} color="var(--navy)" />
            {daysNeedingReviewThisMonth} Picture Day{daysNeedingReviewThisMonth === 1 ? "" : "s"} in {monthLabel(month)}{" "}
            {daysNeedingReviewThisMonth === 1 ? "needs" : "need"} setups confirmed — look for the highlighted rows below.
          </div>
        </Card>
      )}

      {schoolsNeedingAddressAttention.length > 0 && (
        <Card style={{ marginBottom: 20, borderTop: "3px solid var(--gold)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
            <AlertTriangle size={16} color="var(--navy)" />
            {schoolsNeedingAddressAttention.length} saved school{schoolsNeedingAddressAttention.length === 1 ? "" : "s"} need
            {schoolsNeedingAddressAttention.length === 1 ? "s" : ""} an address fixed — mileage and staff-distance
            lookups won&apos;t work until it&apos;s resolved: {schoolsNeedingAddressAttention.map((s) => s.name).join(", ")}
          </div>
        </Card>
      )}

      {schools.length > 0 && (
        <Card style={{ marginBottom: 20, padding: 0 }}>
          <details open={schoolsNeedingAddressAttention.length > 0}>
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                padding: "20px 22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>
                <span className="display" style={{ fontSize: 15.5, fontWeight: 700 }}>
                  Saved schools
                </span>
                <span style={{ fontSize: 12.5, color: "var(--muted)", marginLeft: 10 }}>
                  ({schools.length}) — click to expand
                </span>
              </span>
            </summary>
            <div style={{ padding: "0 22px 20px" }}>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
                Keep addresses current here — they&apos;re used for mileage and for staff-to-school distance lookups
                on the Staff page.
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>School</th>
                    <th>Address</th>
                    <th>Round-trip miles</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((s) => (
                    <SchoolRow key={s.id} school={s} />
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}

      {jobsThisMonth.length === 0 && (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>No jobs booked for {monthLabel(month)}.</div>
        </Card>
      )}

      {jobsThisMonth.map((job) => (
        <Card key={job.id} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="display" style={{ fontSize: 16.5, fontWeight: 700 }}>{job.name}</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <CategoryBadge category={job.category} />
                <SchoolTypeInput jobId={job.id} schoolType={job.school_type} />
                <EnrollmentInput jobId={job.id} enrollment={job.enrollment} />
              </div>
            </div>
            <RemoveJobButton jobId={job.id} />
          </div>
          <table className="data-table" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Setups</th>
                <th>Round-trip miles</th>
                <th>Needs supervisor?</th>
                <th>Outdoor?</th>
                <th>+ Group photo?</th>
              </tr>
            </thead>
            <tbody>
              {job.picture_days.map((d) => (
                <DayRow key={d.id} day={d} />
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
