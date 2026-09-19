import Image from "next/image";
import { Clock, ExternalLink, Images, ListOrdered, LogOut, MapPin, StickyNote } from "lucide-react";
import { Card, RoleTag } from "@/components/ui";
import { getMyAssignments, getMyStaffAccount, getStaffPortalFullTimeline, getStaffPortalTimelineTimes } from "@/lib/data";
import { addDays, todayStr } from "@/lib/month";
import {
  computeStaffPortalDayTimes,
  computeStaffPortalTimelineRows,
  formatClockRange,
  staffPortalArrivalRange,
  type StaffPortalScheduledBlock,
  type StaffPortalTimelineDay,
  type StaffPortalTimelineFields,
} from "@/lib/staffPortal";
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

// One row of the full block-level timeline — a compact, read-only mobile
// rendering of the same real schedule the school's approval page shows
// (timeline-builder's ApprovalView.tsx), re-laid-out for a narrow phone
// column instead of a wide table. Every block_type timeline-builder can
// produce is handled explicitly (see StaffPortalBlockType in
// src/lib/staffPortal.ts) so nothing silently falls through blank.
function TimelineBlockRow({ block }: { block: StaffPortalScheduledBlock }) {
  const time = formatClockRange(block.startMinutes, block.endMinutes);

  if (block.block_type === "section_header") {
    return (
      <div
        style={{
          marginTop: 6,
          padding: "6px 8px",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--navy)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          textAlign: "center",
          background: "var(--purple-tint)",
          borderRadius: 6,
        }}
      >
        {block.section_label}
      </div>
    );
  }

  if (block.block_type === "break" || block.block_type === "transition" || block.block_type === "staff") {
    const fallback = block.block_type === "break" ? "Break" : block.block_type === "staff" ? "Staff Photos" : "Transition";
    return (
      <div style={{ padding: "7px 8px", background: "var(--rose-tint)", borderRadius: 6, marginTop: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, fontWeight: 700 }}>
          <span>{time}</span>
          <span>{block.section_label || fallback}</span>
        </div>
        {block.note_text && (
          <div style={{ fontSize: 11, fontStyle: "italic", color: "var(--muted)", marginTop: 2 }}>{block.note_text}</div>
        )}
      </div>
    );
  }

  if (block.block_type === "note") {
    return (
      <div style={{ fontSize: 11.5, fontStyle: "italic", color: "var(--muted)", padding: "4px 8px" }}>{block.note_text}</div>
    );
  }

  if (block.block_type === "addin") {
    return (
      <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, fontWeight: 700 }}>
          <span>{time}</span>
          <span>
            {block.section_label || "Add-Ins"} ({block.student_count})
          </span>
        </div>
        {block.note_text && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{block.note_text}</div>}
      </div>
    );
  }

  // individual or group — the two real class blocks
  const typeLabel = block.block_type === "group" ? "Group" : "Individual";
  const detailParts = [block.teacher_name, `${typeLabel} · ${block.student_count}`, block.cap_gown_count > 0 ? `${block.cap_gown_count} cap & gown` : ""].filter(
    Boolean
  );
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "7px 8px",
        borderBottom: "1px solid var(--line)",
        background: block.lane === "group" ? "var(--gold-tint)" : undefined,
        borderRadius: block.lane === "group" ? 6 : 0,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", minWidth: 84, flexShrink: 0 }}>{time}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {block.grade_label}
          {block.age_band ? ` (${block.age_band})` : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{detailParts.join(" · ")}</div>
        {block.note_text && (
          <div style={{ fontSize: 11, fontStyle: "italic", color: "var(--muted)", marginTop: 2 }}>{block.note_text}</div>
        )}
      </div>
    </div>
  );
}

// Expandable per-day section — a phone screen showing every block for every
// upcoming Picture Day at once would be cluttered, so this stays collapsed
// until tapped. A plain <details>/<summary> needs no client-side state,
// matching how SchoolsPanel.tsx already collapses its own long list.
function FullTimelineSection({
  timelineFields,
  fullDay,
}: {
  timelineFields: StaffPortalTimelineFields | null;
  fullDay: StaffPortalTimelineDay | null;
}) {
  return (
    <details style={{ marginTop: 14 }}>
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11.5,
          fontWeight: 700,
          color: "var(--navy)",
        }}
      >
        <ListOrdered size={13} /> View Full Timeline
      </summary>
      <div style={{ marginTop: 8 }}>
        {!fullDay || !timelineFields ? (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Timeline not sent yet.</div>
        ) : (
          <>
            {(() => {
              const arrival = staffPortalArrivalRange(timelineFields);
              return (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    background: "var(--rose-tint)",
                    borderRadius: 6,
                    padding: "6px 8px",
                    marginBottom: 2,
                  }}
                >
                  {formatClockRange(arrival.startMinutes, arrival.endMinutes)} — Arrival &amp; Setup
                </div>
              );
            })()}
            {computeStaffPortalTimelineRows(fullDay).map((block) => (
              <TimelineBlockRow key={block.id} block={block} />
            ))}
          </>
        )}
      </div>
    </details>
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
  const pictureDayIds = assignments.map((a) => a.picture_day.id);
  const [timelineTimes, fullTimelines] = await Promise.all([
    getStaffPortalTimelineTimes(pictureDayIds),
    getStaffPortalFullTimeline(pictureDayIds),
  ]);
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
            const fields = timelineTimes.get(a.picture_day.id) ?? null;
            const times = computeStaffPortalDayTimes(fields);
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

                {/* Staff-only, tied to the school rather than this one job —
                    never shown to the school (see staff_notes' own comment
                    in supabase/schema.sql). Only rendered when an owner has
                    actually entered something. */}
                {a.school?.staff_notes && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                      marginTop: 8,
                      padding: "8px 10px",
                      background: "var(--gold-tint)",
                      borderRadius: 8,
                    }}
                  >
                    <StickyNote size={13} style={{ marginTop: 1, flexShrink: 0, color: "var(--navy)" }} />
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--navy)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: 2,
                        }}
                      >
                        Location Notes
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--ink)" }}>{a.school.staff_notes}</div>
                    </div>
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

                <FullTimelineSection timelineFields={fields} fullDay={fullTimelines.get(a.picture_day.id) ?? null} />

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
