import { Clock, CheckCircle2, Send } from "lucide-react";
import {
  getActiveAvailabilityLinkForMonth,
  getAvailability,
  getAvailabilityNotesForMonth,
  getAvailabilitySendLog,
  getJobs,
  getStaff,
} from "@/lib/data";
import { flattenJobDays, groupIdsByDate, neededDatesSummary } from "@/lib/scheduling";
import { getMonthsWithDates, monthLabel, pickDefaultMonth, selectableMonths } from "@/lib/month";
import { Card } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { GenerateLinkButton } from "./GenerateLinkButton";
import { CopyLinkBox } from "./CopyLinkBox";
import { SendAvailabilityButton } from "./SendAvailabilityButton";
import { PixifiCheckButton } from "./PixifiCheckButton";
import { AvailabilityChips } from "./AvailabilityChips";

export default async function AvailabilityTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, allStaff, availability] = await Promise.all([getJobs(), getStaff(), getAvailability()]);
  // Same rule as everywhere else inactive staff are excluded (Schedule
  // candidates, the Send-request action, the public form's own RPC) — a
  // staff member who's left has nothing to respond to going forward.
  const staff = allStaff.filter((s) => s.active);

  const allNeeded = neededDatesSummary(jobs);
  const monthsWithData = getMonthsWithDates(allNeeded.map((n) => n.date));
  const month = sp.month && /^\d{4}-\d{2}-01$/.test(sp.month) ? sp.month : pickDefaultMonth(monthsWithData);

  const [link, notes, sendLog] = await Promise.all([
    getActiveAvailabilityLinkForMonth(month),
    getAvailabilityNotesForMonth(month),
    getAvailabilitySendLog(month),
  ]);
  const noteByStaff = new Map(notes.filter((n) => n.note.trim()).map((n) => [n.staff_id, n.note]));

  const pictureDaysThisMonth = flattenJobDays(jobs)
    .filter((jd) => jd.date.startsWith(month.slice(0, 7)))
    .map((jd) => ({ id: jd.id, date: jd.date }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const pictureDayIdsThisMonth = new Set(pictureDaysThisMonth.map((pd) => pd.id));
  // Multiple jobs can land on the same date — the header count below is
  // "N of M dates", not "N of M bookings", so it needs unique-date groups.
  const dateGroupsThisMonth = groupIdsByDate(pictureDaysThisMonth);

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
            {link?.deadline_at && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                Current deadline:{" "}
                <strong>
                  {new Date(link.deadline_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })}
                </strong>
              </div>
            )}

            {sendLog.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                    marginBottom: 8,
                  }}
                >
                  <Send size={11} /> Already sent this month
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {sendLog.map((entry, i) => {
                    const names = entry.recipient_names;
                    const preview = names.length > 4 ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more` : names.join(", ");
                    return (
                      <div key={i}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>
                          {new Date(entry.sent_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>
                          {entry.sent_by} → {names.length} {names.length === 1 ? "person" : "people"}: {preview}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <PixifiCheckButton month={month} monthLabel={monthLabel(month)} />
              <SendAvailabilityButton
                month={month}
                linkUrl={linkUrl}
                initialDeadline={link?.deadline_at}
                staff={staff.map((s) => ({ id: s.id, name: s.name }))}
              />
            </div>
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
              <th>PIN</th>
              <th>Dates available</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const availableIds = availableIdsByStaff.get(s.id) || [];
              const availableIdSet = new Set(availableIds);
              const datesAvailable = dateGroupsThisMonth.filter((g) => g.ids.every((id) => availableIdSet.has(id))).length;
              const note = noteByStaff.get(s.id);
              return (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, verticalAlign: "top" }}>{s.name}</td>
                  <td style={{ verticalAlign: "top", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{s.pin}</td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 600,
                        marginBottom: 6,
                        color: datesAvailable > 0 ? "var(--good)" : "var(--muted)",
                      }}
                    >
                      {datesAvailable > 0 ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                      {datesAvailable > 0 ? `${datesAvailable} of ${dateGroupsThisMonth.length}` : "Pending"}
                    </div>
                    <AvailabilityChips staffId={s.id} staffName={s.name} pictureDays={pictureDaysThisMonth} initialAvailableIds={availableIds} />
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
