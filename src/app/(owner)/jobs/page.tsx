import { AlertTriangle } from "lucide-react";
import { getEnrollmentStatuses, getJobs, getPictureDayTypes, getSchools } from "@/lib/data";
import { flattenJobDays } from "@/lib/scheduling";
import type { JobWithDays } from "@/lib/types";
import { getMonthsWithDates, monthLabel, pickDefaultMonth, selectableMonths } from "@/lib/month";
import { Card, CategoryBadge } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { JobForm } from "./JobForm";
import { DayRow } from "./DayRow";
import { RemoveJobButton } from "./RemoveJobButton";
import { SchoolsPanel } from "./SchoolsPanel";
import { SchoolTypeInput } from "./SchoolTypeInput";
import { EnrollmentInput } from "./EnrollmentInput";
import { PictureDayTypeInput } from "./PictureDayTypeInput";
import { EnrollmentStatusChip } from "./EnrollmentStatusChip";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, schools] = await Promise.all([getJobs(), getSchools()]);

  const monthsWithData = getMonthsWithDates(flattenJobDays(jobs).map((jd) => jd.date));
  const month = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : pickDefaultMonth(monthsWithData);

  const jobsThisMonth = jobs
    .filter((job) => job.picture_days.some((d) => d.date.startsWith(month.slice(0, 7))))
    .sort((a, b) => {
      const firstDate = (job: JobWithDays) =>
        job.picture_days.find((d) => d.date.startsWith(month.slice(0, 7)))?.date ?? "";
      return firstDate(a).localeCompare(firstDate(b));
    });

  // Picture day type per job, from the one shared rule — for the box on
  // each job card.
  const [dayTypes, enrollment] = await Promise.all([
    getPictureDayTypes(jobsThisMonth),
    getEnrollmentStatuses(jobsThisMonth.map((j) => j.id)),
  ]);

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
          <SchoolsPanel schools={schools} defaultOpen={schoolsNeedingAddressAttention.length > 0} />
        </Card>
      )}

      {jobsThisMonth.length === 0 && (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>No jobs booked for {monthLabel(month)}.</div>
        </Card>
      )}

      {jobsThisMonth.map((job) => (
        <Card key={job.id} style={{ marginBottom: 14, ...(job.locked ? { borderTop: "3px solid var(--navy)" } : {}) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="display" style={{ fontSize: 16.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                {job.name}
                {job.locked && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", background: "var(--bg)", padding: "2px 8px", borderRadius: 20 }}>
                    Locked
                  </span>
                )}
              </div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <CategoryBadge category={job.category} />
                <SchoolTypeInput jobId={job.id} schoolType={job.school_type} />
                <EnrollmentInput
                  jobId={job.id}
                  enrollment={job.enrollment}
                  lastYear={enrollment.get(job.id)?.from === "last_year" ? enrollment.get(job.id)?.number ?? null : null}
                />
                <EnrollmentStatusChip jobId={job.id} status={enrollment.get(job.id)} />
                <PictureDayTypeInput
                  jobId={job.id}
                  resolved={dayTypes.byJob.get(job.id)?.type ?? null}
                  isAuto={dayTypes.byJob.get(job.id)?.isAuto ?? true}
                  schoolTypes={(job.school_id && dayTypes.schoolTypes.get(job.school_id)) || []}
                />
              </div>
              {/* More students than the setups can take (Settings → Enrollment
                  in Timeline Builder: 150 per station K-12, 75 preschool). */}
              {enrollment.get(job.id)?.over && (() => {
                const e = enrollment.get(job.id)!;
                const students = Math.max(e.number ?? 0, e.rosterCount ?? 0);
                const fromRoster = e.from === "roster" || (e.rosterCount ?? 0) > (e.number ?? 0);
                return (
                  <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "var(--bad)" }}>
                    ⚠ About {students} students{fromRoster ? " on the roster" : e.from === "last_year" ? " (last year's number)" : ""} — more than these setups can take ({e.capacity}). May need another setup.
                  </div>
                );
              })()}
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
                <th>Babies?</th>
                <th>Trainee?</th>
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
