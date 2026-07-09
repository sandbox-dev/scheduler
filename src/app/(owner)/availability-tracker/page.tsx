import { Clock, CheckCircle2 } from "lucide-react";
import { getActiveAvailabilityLinkForMonth, getAvailability, getAvailabilityNotesForMonth, getJobs, getStaff } from "@/lib/data";
import { flattenJobDays, neededDatesSummary } from "@/lib/scheduling";
import { getMonthsWithDates, monthLabel, pickDefaultMonth, selectableMonths } from "@/lib/month";
import { Card } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { GenerateLinkButton } from "./GenerateLinkButton";
import { CopyLinkBox } from "./CopyLinkBox";
import { AvailabilityChips } from "./AvailabilityChips";

export default async function AvailabilityTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, availability] = await Promise.all([getJobs(), getStaff(), getAvailability()]);

  const allNeeded = neededDatesSummary(jobs);
  const monthsWithData = getMonthsWithDates(allNeeded.map((n) => n.date));
  const month = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : pickDefaultMonth(monthsWithData);

  const [link, notes] = await Promise.all([
    getActiveAvailabilityLinkForMonth(month),
    getAvailabilityNotesForMonth(month),
  ]);
  const noteByStaff = new Map(notes.filter((n) => n.note.trim()).map((n) => [n.staff_id, n.note]));

  const pictureDaysThisMonth = flattenJobDays(jobs)
    .filter((jd) => jd.date.startsWith(month.slice(0, 7)))
    .map((jd) => ({ id: jd.id, date: jd.date }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const pictureDayIdsThisMonth = new Set(pictureDaysThisMonth.map((pd) => pd.id));

  const availableIdsByStaff = new Map<string, string[]>();
  availability.forEach((a) => {
    if (!a.available || !pictureDayIdsThisMonth.has(a.picture_day_id)) return;
    const list = availableIdsByStaff.get(a.staff_id) || [];
    list.push(a.picture_day_id);
    availableIdsByStaff.set(a.staff_id, list);
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const linkUrl = link ? `${siteUrl}/availability/${link.token}` : null;

  return (
    <div>
      <div className="display" style={{ fontSize: 21, fontWeight: 800, marginBottom: 4 }}>Availability</div>
      <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 16 }}>
        Generate a month&apos;s link and send it to staff yourself (text or email) — no account required for them to
        respond. You can also tap any date below to add or remove availability directly, e.g. if someone lets you
        know about a change by phone.
      </div>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <MonthPicker month={month} months={selectableMonths(monthsWithData)} monthsWithData={monthsWithData} />
        </div>

        {linkUrl ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>
              {monthLabel(month)} availability link (valid 45 days):
            </div>
            <CopyLinkBox url={linkUrl} />
          </>
        ) : (
          <GenerateLinkButton month={month} />
        )}
      </Card>

      <Card>
        <div className="display" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          Response tracker — {monthLabel(month)}
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Dates available</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const availableIds = availableIdsByStaff.get(s.id) || [];
              const note = noteByStaff.get(s.id);
              return (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, verticalAlign: "top" }}>{s.name}</td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 600,
                        marginBottom: 6,
                        color: availableIds.length > 0 ? "var(--good)" : "var(--muted)",
                      }}
                    >
                      {availableIds.length > 0 ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      {availableIds.length > 0 ? `${availableIds.length} of ${pictureDaysThisMonth.length}` : "Pending"}
                    </div>
                    <AvailabilityChips staffId={s.id} pictureDays={pictureDaysThisMonth} initialAvailableIds={availableIds} />
                  </td>
                  <td style={{ verticalAlign: "top", maxWidth: 220, fontSize: 12.5, color: "var(--ink)" }}>
                    {note || <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
