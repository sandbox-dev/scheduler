import Image from "next/image";
import Link from "next/link";
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, ExternalLink, Images, ListOrdered, LogOut, MapPin, NotebookPen } from "lucide-react";
import { Card, RoleTag } from "@/components/ui";
import { CalendarSubscribeLink } from "./CalendarSubscribeLink";
import {
  getMyAssignments,
  getMyStaffAccount,
  getStaffPortalBriefing,
  getStaffPortalCrew,
  getStaffPortalFullTimeline,
  getStaffPortalTimelineTimes,
  type StaffPortalAssignment,
} from "@/lib/data";
import { addDays, mondayOf, todayPacific } from "@/lib/month";
import { fmtDate } from "@/lib/scheduling";
import {
  computeStaffPortalDayTimes,
  computeStaffPortalTimelineRows,
  formatClockRange,
  staffPortalArrivalRange,
  staffPortalSchoolTypeLabel,
  visibleStaffPortalCustomFields,
  type StaffPortalBriefingFields,
  type StaffPortalCrewMember,
  type StaffPortalScheduledBlock,
  type StaffPortalTimelineDay,
  type StaffPortalTimelineFields,
} from "@/lib/staffPortal";
import { logout } from "./login/actions";

// Adi-approved (in a separate mockup, never built until now): each major
// section on an expanded day card — Schedule, Team, Details, Full Timeline —
// gets its own lightly-boxed sub-section instead of just flowing together
// with a small text label between them ("it's a lot of info in one box, all
// smushed together... the headers get lost"). Deliberately NOT applied to
// the card's own identity header or to Location Notes — that's "small
// enough to sit on its own," not its own big box. (The Setup/Reference
// Photos links used to sit here too, unboxed, but moved inside the Details
// box 2026-09-19 — see DayBriefingSection below.)
const sectionBoxStyle = {
  background: "#FAF8F5",
  border: "1px solid var(--line)",
  borderRadius: 14,
  padding: 16,
};

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
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: value === "TBD" ? "var(--muted)" : "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

// One labeled fact in the Day Briefing (Backdrop/Notes/Wifi) — short
// label-over-text, same shape as the existing "Location Notes" box's own
// inner label/value pair, just without that box's background tint (this
// section already has its own "Day Briefing" heading, so a tint per fact
// would be one visual weight too many).
function BriefingFact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, color: "var(--ink)", marginTop: 1 }}>{value}</div>
    </div>
  );
}

// The new section Adi asked for: the same facts currently hand-copied into
// Pixifi's own event notes for staff to read there, shown natively and
// formatted for a phone screen instead of a raw copy-paste block. Rendered
// inline (not a collapsible <details> like Full Timeline below) — a
// handful of short facts plus a short team list reads fine on one screen,
// unlike the long block-by-block timeline that section exists to hide by
// default.
function DayBriefingSection({
  job,
  pictureDay,
  briefing,
  crew,
  hasReferencePhotos,
}: {
  job: StaffPortalAssignment["job"];
  pictureDay: StaffPortalAssignment["picture_day"];
  briefing: StaffPortalBriefingFields | null;
  crew: StaffPortalCrewMember[];
  hasReferencePhotos: boolean;
}) {
  return (
    <>
      {crew.length > 0 && (
        <div style={{ ...sectionBoxStyle, marginTop: 14 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--navy)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 12,
            }}
          >
            Team
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {crew.map((member, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16 }}>
                <RoleTag role={member.role} />
                <span>{member.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...sectionBoxStyle, marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 12,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          <ClipboardList size={12} /> Details
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <TimeStat label="School Type" value={staffPortalSchoolTypeLabel(job)} />
          <TimeStat label="Setups" value={String(pictureDay.setups)} />
          <TimeStat label="Location" value={pictureDay.is_outdoor ? "Outdoor" : "Indoor"} />
        </div>

        {briefing?.individual_photo_location && (
          <BriefingFact label="Individual Photo Location" value={briefing.individual_photo_location} />
        )}
        {briefing?.backdrop && <BriefingFact label="Backdrop" value={briefing.backdrop} />}
        {briefing?.parking_notes && (
          <>
            <BriefingFact label="Parking Notes" value={briefing.parking_notes} />
            {hasReferencePhotos && (
              <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic", marginTop: 2 }}>
                See Reference Photos folder for any parking maps or photos
              </div>
            )}
          </>
        )}
        {briefing?.dress_code_note && <BriefingFact label="Dress Code" value={briefing.dress_code_note} />}
        {briefing?.additional_gear_notes && <BriefingFact label="Additional Gear" value={briefing.additional_gear_notes} />}
        {briefing?.notes && <BriefingFact label="Notes" value={briefing.notes} />}
        {briefing?.wifi_network && (
          <BriefingFact
            label="Wifi"
            value={briefing.wifi_password ? `${briefing.wifi_network} — ${briefing.wifi_password}` : briefing.wifi_network}
          />
        )}
        {briefing && visibleStaffPortalCustomFields(briefing.custom_fields).map((f) => (
          <BriefingFact key={f.id} label={f.label} value={f.value} />
        ))}

        {/* Per-SCHOOL Google Drive links (every job at this school shares
            the same two folders) — lives on tb_schools now, owner-set from
            Timeline Builder's School Details page. Placed at the end of
            this same Details box (moved here from unboxed-near-the-top
            2026-09-19) since these are just two more staff-facing school
            facts, not their own concept. */}
        {(briefing?.setup_photos_url || briefing?.reference_photos_url) && (
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {briefing?.setup_photos_url && (
              <a
                href={briefing.setup_photos_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ flex: 1, justifyContent: "center", background: "var(--navy)", color: "#fff", border: "none" }}
              >
                <Images size={13} /> Setup Photos <ExternalLink size={12} />
              </a>
            )}
            {briefing?.reference_photos_url && (
              <a
                href={briefing.reference_photos_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ flex: 1, justifyContent: "center", background: "var(--navy)", color: "#fff", border: "none" }}
              >
                <Images size={13} /> Reference Photos <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}
      </div>
    </>
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
          fontSize: 13,
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 16, fontWeight: 700 }}>
          <span>{time}</span>
          <span>{block.section_label || fallback}</span>
        </div>
        {block.note_text && (
          <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--muted)", marginTop: 2 }}>{block.note_text}</div>
        )}
      </div>
    );
  }

  if (block.block_type === "note") {
    return (
      <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--muted)", padding: "4px 8px" }}>{block.note_text}</div>
    );
  }

  if (block.block_type === "addin") {
    return (
      <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 16, fontWeight: 700 }}>
          <span>{time}</span>
          <span>
            {block.section_label || "Add-Ins"} ({block.student_count})
          </span>
        </div>
        {block.note_text && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{block.note_text}</div>}
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
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--muted)", minWidth: 96, flexShrink: 0 }}>{time}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* age_band is purely internal scheduling data (duration/qualification
            logic) — never shown on any real timeline (verified against
            timeline-builder's own print page and owner timeline page, neither
            of which reference it). Adi: "no one ever needs to see that." */}
        <div style={{ fontSize: 16, fontWeight: 700 }}>{block.grade_label}</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{detailParts.join(" · ")}</div>
        {block.note_text && (
          <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--muted)", marginTop: 2 }}>{block.note_text}</div>
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
    <details style={{ ...sectionBoxStyle, marginTop: 14 }}>
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 12,
          fontSize: 15,
          fontWeight: 700,
          color: "var(--navy)",
        }}
      >
        <ListOrdered size={13} /> View Full Timeline
      </summary>
      <div>
        {!fullDay || !timelineFields ? (
          <div style={{ fontSize: 15, color: "var(--muted)" }}>Timeline not sent yet.</div>
        ) : (
          <>
            {(() => {
              const arrival = staffPortalArrivalRange(timelineFields);
              return (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 16,
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

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const account = await getMyStaffAccount();

  // Shouldn't normally happen — the proxy only ever routes a linked
  // account here — but fails closed with a plain message instead of
  // guessing whose schedule to show.
  if (!account) {
    return (
      <div style={{ minHeight: "100dvh", padding: 24, maxWidth: 420, margin: "0 auto" }}>
        <Card>
          <div style={{ fontSize: 16, color: "var(--muted)" }}>
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

  const sp = await searchParams;
  const today = todayPacific();
  // A calendar week, Monday–Sunday — Adi, 2026-09-25: "A week should be
  // Monday-Sunday date-wise." It used to be a rolling 7 days from today
  // (e.g. Wednesday–Tuesday). Any ?start= is snapped to its Monday too, so
  // an old bookmarked link still lands on a proper week.
  const weekStart = mondayOf(sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : today);
  const weekEnd = addDays(weekStart, 6);
  const assignments = await getMyAssignments(account.id, weekStart, weekEnd);
  const pictureDayIds = assignments.map((a) => a.picture_day.id);
  const [timelineTimes, fullTimelines, briefings, crews] = await Promise.all([
    getStaffPortalTimelineTimes(pictureDayIds),
    getStaffPortalFullTimeline(pictureDayIds),
    getStaffPortalBriefing(pictureDayIds),
    getStaffPortalCrew(pictureDayIds),
  ]);
  const firstName = account.name.split(" ")[0];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const calendarFeedUrl = `${siteUrl}/api/calendar/${account.calendar_token}.ics`;

  return (
    <div style={{ minHeight: "100dvh" }}>
      <div className="top-bar no-print">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image src="/logo.png" alt="Sandbox Photographers" width={84} height={34} style={{ objectFit: "contain" }} priority />
            <div className="display" style={{ fontSize: 20, fontWeight: 700 }}>Hi, {firstName}</div>
          </div>
          <form action={logout}>
            <button className="btn-secondary" type="submit">
              <LogOut size={13} /> Sign Out
            </button>
          </form>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="display" style={{ fontSize: 17, fontWeight: 700, textAlign: "center" }}>Your Booked Jobs</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Link href={`/team?start=${addDays(weekStart, -7)}`} className="btn-secondary" style={{ padding: "7px 10px" }}>
            <ChevronLeft size={14} />
          </Link>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {fmtDate(weekStart).md} – {fmtDate(weekEnd).md}
          </div>
          <Link href={`/team?start=${addDays(weekStart, 7)}`} className="btn-secondary" style={{ padding: "7px 10px" }}>
            <ChevronRight size={14} />
          </Link>
        </div>

        {/* Replaces Adi manually re-entering your schedule into Pixifi's own
            calendar by hand — this feed IS your real, always-current
            schedule. Collapsed by default (same no-JS <details> pattern as
            "View Full Timeline" below) since most visits here don't need
            it — it only has to be set up once. */}
        <Card style={{ padding: 0 }}>
          <details className="day-card">
            <summary className="day-card-summary" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
              <CalendarPlus size={14} /> Subscribe To Your Calendar
            </summary>
            <div style={{ padding: "0 18px 16px" }}>
              <CalendarSubscribeLink httpsUrl={calendarFeedUrl} />
            </div>
          </details>
        </Card>

        {assignments.length === 0 ? (
          <Card>
            <div style={{ fontSize: 16, color: "var(--muted)" }}>
              No Picture Days scheduled for {fmtDate(weekStart).md} – {fmtDate(weekEnd).md}.
            </div>
          </Card>
        ) : (
          assignments.map((a) => {
            const fields = timelineTimes.get(a.picture_day.id) ?? null;
            const times = computeStaffPortalDayTimes(fields);
            const briefing = briefings.get(a.picture_day.id) ?? null;
            return (
              <Card key={a.id} style={{ padding: 0 }}>
                {/* Collapsed by default (Adi: less scrolling, see date +
                    school at a glance) — a plain <details> so this needs no
                    client state, same no-JS-collapse approach already used
                    for the nested "View Full Timeline" section below.
                    Assignments are sorted ascending by date across the
                    Monday–Sunday week (see weekStart above); today's card
                    carries the "Today" label so it stands out among the
                    week's earlier days. It still opens collapsed like every
                    other card. */}
                <details className="day-card">
                  <summary className="day-card-summary" style={{ padding: "20px 22px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {formatDayLabel(a.picture_day.date, today)}
                          {a.job_total_days > 1 ? ` · Day ${a.job_day_number} of ${a.job_total_days}` : ""}
                        </div>
                        <div className="display" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                          {a.school?.name ?? a.job.name}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <RoleTag role={a.role} />
                        <ChevronDown size={18} className="day-card-chevron" style={{ color: "var(--muted)" }} />
                      </div>
                    </div>
                  </summary>

                  <div style={{ padding: "0 22px 20px" }}>
                    {a.school?.address && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.school.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 2, fontSize: 16, color: "var(--navy)", textDecoration: "underline" }}
                      >
                        <MapPin size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                        {a.school.address}
                      </a>
                    )}

                    {/* Staff-only, tied to the school rather than this one job —
                        lives on Timeline Builder's tb_schools.location_notes
                        now (moved 2026-09-19 from this app's own
                        schools.staff_notes so a school's details have one
                        home instead of two — see staff_portal_briefing_for_
                        days()'s own comment in supabase/schema.sql), read
                        through the same `briefing` data as every other
                        Details fact below. Only rendered when an owner has
                        actually entered something. Plain BriefingFact styling
                        (Adi: the earlier gold-tinted callout box read as an
                        "alert" and made an often-empty fact the loudest thing
                        on the card) — same quiet label-over-text treatment as
                        Parking Notes/Backdrop/every other Details fact below,
                        not a special one-off style. */}
                    {briefing?.location_notes && <BriefingFact label="Location Notes" value={briefing.location_notes} />}

                    <div style={{ ...sectionBoxStyle, marginTop: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        <Clock size={12} /> Schedule
                      </div>
                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                        <TimeStat label="Arrival" value={times.arrival} />
                        <TimeStat label="Start" value={times.start} />
                        <TimeStat label="End" value={times.end} />
                      </div>
                    </div>

                    <DayBriefingSection
                      job={a.job}
                      pictureDay={a.picture_day}
                      briefing={briefing}
                      crew={crews.get(a.picture_day.id) ?? []}
                      hasReferencePhotos={!!briefing?.reference_photos_url}
                    />

                    <FullTimelineSection timelineFields={fields} fullDay={fullTimelines.get(a.picture_day.id) ?? null} />

                    {/* Deliberately NOT inside any of the four sectionBoxStyle
                        boxes above (Schedule/Team/Details/Timeline) — those
                        are all the before-the-job plan. This is the
                        after-the-job feedback form, a genuinely separate
                        concept from Details/Event Info, so it gets its own
                        distinct styling (.btn-rose, same "reads as its own
                        distinct action" treatment as the Check Pixifi button
                        on the owner side) instead of blending in as one more
                        Details fact. Placed last, after Timeline, since a
                        staff member fills this out once their day is done. */}
                    <a
                      href="https://docs.google.com/forms/d/e/1FAIpQLSemK3O5lFUIuGHxl9gZfkhVLIi2AN7yfmq3w1rj_Lc_W4xyog/viewform"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-rose"
                      style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                    >
                      <NotebookPen size={13} /> Fill Out Shoot Notes <ExternalLink size={12} />
                    </a>
                  </div>
                </details>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
