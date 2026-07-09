import Link from "next/link";
import { Download, AlertTriangle } from "lucide-react";
import { getJobs, getScheduleAssignments, getStaff } from "@/lib/data";
import { flattenJobDays, mileageReport, neededDatesSummary } from "@/lib/scheduling";
import { Card, RoleTag, Stat } from "@/components/ui";
import { STUDIO_ADDRESS, MILEAGE_RATE, ROLES, type Role } from "@/lib/types";

function defaultRange(dates: string[]): [string, string] {
  if (dates.length === 0) {
    const now = new Date();
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return [first, first];
  }
  return [dates[0], dates[dates.length - 1]];
}

export default async function MileagePage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, assignments] = await Promise.all([getJobs(), getStaff(), getScheduleAssignments()]);

  const needed = neededDatesSummary(jobs);
  const [defStart, defEnd] = defaultRange(needed.map((n) => n.date));
  const startDate = sp.start || defStart;
  const endDate = sp.end || defEnd;

  const allJobDays = flattenJobDays(jobs);
  const pictureDaysById: Record<string, { date: string; round_trip_miles: number }> = {};
  allJobDays.forEach((jd) => {
    pictureDaysById[jd.id] = { date: jd.date, round_trip_miles: jd.round_trip_miles };
  });

  const hasSchedule = assignments.length > 0;
  const mileageEligibleStaff = staff.filter((s) => s.mileage_eligible);
  const rows = hasSchedule ? mileageReport(assignments, pictureDaysById, mileageEligibleStaff, startDate, endDate) : [];
  const totalPay = rows.reduce((a, r) => a + r.pay, 0);
  const totalMiles = rows.reduce((a, r) => a + r.miles, 0);

  const jobDaysInRange = allJobDays.filter((jd) => jd.date >= startDate && jd.date <= endDate);
  const totalSetups = jobDaysInRange.reduce((a, jd) => a + jd.setups, 0);
  const plannedByRole = Object.fromEntries(
    ROLES.map((r) => [r, jobDaysInRange.reduce((a, jd) => a + jd.crew[r], 0)])
  ) as Record<Role, number>;
  const inRangeDayIds = new Set(jobDaysInRange.map((jd) => jd.id));
  const assignedByRole = Object.fromEntries(
    ROLES.map((r) => [
      r,
      assignments.filter((a) => a.role === r && a.staff_id && inRangeDayIds.has(a.picture_day_id)).length,
    ])
  ) as Record<Role, number>;

  return (
    <div>
      <div className="display" style={{ fontSize: 21, fontWeight: 800, marginBottom: 4 }}>Payroll &amp; reports</div>
      <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16 }}>
        Pick any date range below to see how many setups it covers, how many staff by role, and the mileage pay for
        whoever actually worked it. Round-trip miles are from your studio ({STUDIO_ADDRESS}) at ${MILEAGE_RATE.toFixed(2)}/mile.
      </div>

      <Card style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginBottom: 5 }}>Range start</div>
            <input type="date" className="field-input" name="start" defaultValue={startDate} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginBottom: 5 }}>Range end</div>
            <input type="date" className="field-input" name="end" defaultValue={endDate} />
          </div>
          <button className="btn-secondary" type="submit">Update</button>
          {hasSchedule && (
            <a className="btn-primary" href={`/api/mileage/csv?start=${startDate}&end=${endDate}`}>
              <Download size={14} /> Export CSV
            </a>
          )}
        </form>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Season summary</div>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 16 }}>
          <Stat label="Picture Days" value={jobDaysInRange.length} />
          <Stat label="Total setups" value={totalSetups} />
          {hasSchedule && <Stat label="Total round-trip miles" value={totalMiles} />}
          {hasSchedule && <Stat label="Total mileage pay" value={`$${totalPay.toFixed(2)}`} />}
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {ROLES.map((r) => (
            <div key={r}>
              <div style={{ marginBottom: 4 }}>
                <RoleTag role={r} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {hasSchedule ? assignedByRole[r] : plannedByRole[r]}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {hasSchedule ? `assigned (of ${plannedByRole[r]} needed)` : "needed by the crew formula"}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {!hasSchedule && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <AlertTriangle size={15} color="var(--navy)" />
            No schedule generated yet — mileage and staff-assigned counts need an actual schedule to work from.
            <Link href="/schedule" className="btn-secondary">
              Go generate one
            </Link>
          </div>
        </Card>
      )}

      {hasSchedule && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Mileage by employee</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Days worked</th>
                <th>Round-trip miles</th>
                <th>Mileage pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--muted)" }}>No one is scheduled to work in this date range yet.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td>{r.daysWorked}</td>
                  <td>{r.miles}</td>
                  <td style={{ fontWeight: 700, color: "var(--navy)" }}>${r.pay.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
