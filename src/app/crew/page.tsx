import Image from "next/image";
import { Clock, ExternalLink, Images, LogOut, MapPin } from "lucide-react";
import { Card, RoleTag } from "@/components/ui";
import { getMyAssignments, getMyStaffAccount, getStaffPortalTimelineTimes } from "@/lib/data";
import { addDays, todayStr } from "@/lib/month";
import { computeStaffPortalDayTimes } from "@/lib/staffPortal";
import { logout } from "./login/actions";

// "Today, Fri, Sep 19" for today, plain "Sat, Sep 20" for everything else —
// the whole point of the badge is making today's card impossible to miss
// on a small phone screen at a glance.
function formatDayLabel(dateStr: string, todayIso: string) {
  const d = new Date(dateStr + "T00:00:00");
  const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return dateStr === todayIso ? `Today · ${label}` : label;
}

function TimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 2, color: value === "TBD" ? "var(--muted)" : "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

export default async function CrewPage() {
  const account = await getMyStaffAccount();

  // Shouldn't normally happen — the proxy only ever routes a linked
  // account here — but fails closed with a plain message instead of
  // guessing whose schedule to show.
  if (!account) {
    return (
      <div style={{ minHeight: "100dvh", padding: 24, maxWidth: 420, margin: "0 auto" }}>
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
            This login isn&apos;t connected to a staff profile yet. Ask the studio to link your account.
          </div>
          <form action={logout} style={{ marginTop: 16 }}>
            <button className="btn-secondary" type="submit">
              Sign Out
            </button>
          </form>
        </Card>
      </div>
    );
  }

  const today = todayStr();
  const weekEnd = addDays(today, 6);
  const assignments = await getMyAssignments(account.id, today, weekEnd);
  const timelineTimes = await getStaffPortalTimelineTimes(assignments.map((a) => a.picture_day.id));
  const firstName = account.name.split(" ")[0];

  return (
    <div style={{ minHeight: "100dvh" }}>
      <div className="top-bar no-print">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image src="/logo.png" alt="Sandbox Photographers" width={64} height={26} style={{ objectFit: "contain" }} priority />
            <div className="display" style={{ fontSize: 15, fontWeight: 700 }}>Hi, {firstName}</div>
          </div>
          <form action={logout}>
            <button className="btn-secondary" type="submit">
              <LogOut size={13} /> Sign Out
            </button>
          </form>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {assignments.length === 0 ? (
          <Card>
            <div style={{ fontSize: 13.5, color: "var(--muted)" }}>No Picture Days on the schedule for you this week.</div>
          </Card>
        ) : (
          assignments.map((a) => {
            const times = computeStaffPortalDayTimes(timelineTimes.get(a.picture_day.id) ?? null);
            return (
              <Card key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {formatDayLabel(a.picture_day.date, today)}
                    </div>
                    <div className="display" style={{ fontSize: 16.5, fontWeight: 700, marginTop: 2 }}>
                      {a.school?.name ?? a.job.name}
                    </div>
                  </div>
                  <RoleTag role={a.role} />
                </div>

                {a.school?.address && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>
                    <MapPin size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                    {a.school.address}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  <Clock size={12} /> Schedule
                </div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <TimeStat label="Arrival" value={times.arrival} />
                  <TimeStat label="Start" value={times.start} />
                  <TimeStat label="End" value={times.end} />
                </div>

                {a.job.reference_photos_url && (
                  <a
                    href={a.job.reference_photos_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                  >
                    <Images size={13} /> Reference Photos <ExternalLink size={12} />
                  </a>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
