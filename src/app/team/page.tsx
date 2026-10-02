import Link from "next/link";
import { CalendarPlus, CheckCircle2, MessageSquare, Phone, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, ExternalLink, Images, ListOrdered, MapPin, NotebookPen } from "lucide-react";
import { Card, RoleTag } from "@/components/ui";
import { CalendarSubscribeLink } from "./CalendarSubscribeLink";
import { SharePhonePrompt } from "./SharePhonePrompt";
import { TeamTopBar } from "./TeamTopBar";
import {
  getMyAssignments,
  getMyStaffAccount,
  getStaffPortalBriefing,
  getStaffPortalCrew,
  getStaffPortalFullTimeline,
  getStaffPortalTimelineTimes,
  getShootNotesDone,
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
// One bullet per line typed (Adi, 2026-10-02: "each enter should be a
// bullet point"). A leading "-" or "•" someone typed themselves is dropped.
function noteBullets(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n+/)
    .map((t) => t.replace(/^[-•*·]\s*/, "").trim())
    .filter(Boolean);
}

// Lines under a fact, one per line typed, never joined with dashes
// (Adi, 2026-10-02: "em dashes which are messy and hard to read"). `bullets`
// lists each line typed as a bullet.
function BriefingFact({ label, value, bullets }: { label: string; value?: React.ReactNode; bullets?: string | null }) {
  const items = noteBullets(bullets);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label.replace(/:\s*$/, "")}
      </div>
      {value != null && value !== "" && <div style={{ fontSize: 16, color: "var(--ink)", marginTop: 1 }}>{value}</div>}
      {items.length > 0 && (
        <ul style={{ margin: "2px 0 0", paddingLeft: 22, listStyleType: "disc", fontSize: 16, color: "var(--ink)", lineHeight: 1.45 }}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
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
}: {
  job: StaffPortalAssignment["job"];
  pictureDay: StaffPortalAssignment["picture_day"];
  briefing: StaffPortalBriefingFields | null;
  crew: StaffPortalCrewMember[];
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
                <RoleTag role={member.role} label={member.is_group_photographer ? "Group Photographer" : undefined} />
                <span>{member.name}</span>
                {/* Only for teammates who agreed to share their number. */}
                {member.phone && (
                  <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
                    <a href={`tel:${member.phone.replace(/[^0-9+]/g, "")}`} className="btn-secondary" style={{ padding: "4px 9px", fontSize: 13 }} aria-label={`Call ${member.name}`}>
                      <Phone size={13} /> Call
                    </a>
                    <a href={`sms:${member.phone.replace(/[^0-9+]/g, "")}`} className="btn-secondary" style={{ padding: "4px 9px", fontSize: 13 }} aria-label={`Text ${member.name}`}>
                      <MessageSquare size={13} /> Text
                    </a>
                  </span>
                )}
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

        {(briefing?.day_of_contact_name || briefing?.day_of_contact_phone) && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Day-Of Contact</div>
            {briefing.day_of_contact_name && <div style={{ fontSize: 16, color: "var(--ink)", marginTop: 1 }}>{briefing.day_of_contact_name}</div>}
            {briefing.day_of_contact_phone && (
              <div style={{ fontSize: 16, marginTop: 1 }}>
                <a href={`tel:${briefing.day_of_contact_phone.replace(/[^0-9+]/g, "")}`} style={{ color: "var(--navy)", fontWeight: 700 }}>
                  {briefing.day_of_contact_phone}
                </a>
              </div>
            )}
          </div>
        )}
        {briefing?.individual_photo_location && (
          <BriefingFact
            label="Individual Photo Location"
            value={briefing.individual_photo_location}
            bullets={briefing.individual_location_notes}
          />
        )}
        {briefing?.group_photo_location && (
          <BriefingFact
            label="Group Photo Location"
            value={briefing.group_photo_location}
            bullets={briefing.group_location_notes}
          />
        )}
        {briefing?.backdrop && <BriefingFact label="Backdrop" value={briefing.backdrop} />}
        {/* School-wide (tb_schools.location_notes, set on School Details).
            Moved here beside Parking Notes 2026-09-28 — Adi: "so we know
            its there" (it used to sit alone under the address). */}
        {briefing?.location_notes && <BriefingFact label="Location Notes" value={briefing.location_notes} />}
        {briefing?.parking_notes && <BriefingFact label="Parking Notes" value={briefing.parking_notes} />}
        {briefing?.dress_code_note && <BriefingFact label="Dress Code" value={briefing.dress_code_note} />}
        {briefing?.additional_gear_notes && <BriefingFact label="Additional Gear" value={briefing.additional_gear_notes} />}
        {/* Our Notes, one bullet per line (Adi, 2026-10-02). The school's
            own instructions aren't shown to staff — "if it's pertinent we
            will put it in notes." */}
        {noteBullets(briefing?.notes).length > 0 && <BriefingFact label="Notes" bullets={briefing?.notes} />}
        {briefing?.wifi_network && (
          <BriefingFact
            label="Wifi"
            value={
              <>
                <div>{briefing.wifi_network}</div>
                {briefing.wifi_password && <div>Password: {briefing.wifi_password}</div>}
              </>
            }
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
          <div style={{ fontSize: 15, color: "var(--muted)" }}>Timeline not approved yet.</div>
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
  const [timelineTimes, fullTimelines, briefings, crews, shootNotesDone] = await Promise.all([
    getStaffPortalTimelineTimes(pictureDayIds),
    getStaffPortalFullTimeline(pictureDayIds),
    getStaffPortalBriefing(pictureDayIds),
    getStaffPortalCrew(pictureDayIds),
    getShootNotesDone(pictureDayIds),
  ]);
  const firstName = account.name.split(" ")[0];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const calendarFeedUrl = `${siteUrl}/api/calendar/${account.calendar_token}.ics`;

  return (
    <div style={{ minHeight: "100dvh" }}>
      <TeamTopBar firstName={firstName} />

      <div style={{ padding: 16, maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {account.share_phone == null && <SharePhonePrompt current={null} />}
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
                        {/* Baby gear needed (Adi, 2026-09-30) — same pink tag as
                            the weekly printable sheet, on every day of the job. */}
                        {a.picture_day.is_babies && (
                          <span
                            style={{
                              display: "inline-block",
                              marginTop: 6,
                              fontSize: 13,
                              fontWeight: 700,
                              padding: "1px 10px",
                              borderRadius: 999,
                              background: "#F9DDE7",
                              border: "1px solid #E7A6BD",
                              color: "#9B2F57",
                            }}
                          >
                            Babies
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <RoleTag role={a.role} label={a.is_group_photographer ? "Group Photographer" : undefined} />
                        <ChevronDown size={18} className="day-card-chevron" style={{ color: "var(--muted)" }} />
                      </div>
                    </div>
                  </summary>

                  <div style={{ padding: "0 22px 20px" }}>
                    {/* Google Maps or Apple Maps — staff asked for the choice
                        (2026-10-02). */}
                    {a.school?.address && (
                      <div style={{ marginTop: 2 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 16, color: "var(--ink)" }}>
                          <MapPin size={13} style={{ marginTop: 4, flexShrink: 0 }} />
                          {a.school.address}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, paddingLeft: 19 }}>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.school.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary"
                            style={{ padding: "5px 11px", fontSize: 13.5 }}
                          >
                            Google Maps
                          </a>
                          <a
                            href={`https://maps.apple.com/?q=${encodeURIComponent(a.school.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary"
                            style={{ padding: "5px 11px", fontSize: 13.5 }}
                          >
                            Apple Maps
                          </a>
                        </div>
                      </div>
                    )}

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
                    />

                    <FullTimelineSection timelineFields={fields} fullDay={fullTimelines.get(a.picture_day.id) ?? null} />

                    {/* After-the-day feedback, its own action after Timeline.
                        In the team app since 2026-09-29 (was a Google Form).
                        Once anyone on the team sends it, everyone just sees
                        it's done — never the answers. Shown on every day, like
                        the Google Form button was (Adi couldn't find it when it
                        only appeared from the day itself on). */}
                    {shootNotesDone.has(a.picture_day.id) ? (
                      <div style={{ marginTop: 14, textAlign: "center", fontSize: 15, fontWeight: 700, color: "var(--good)" }}>
                        <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Shoot Notes: Done
                      </div>
                    ) : (
                      <Link
                        href={`/team/shoot-notes/${a.picture_day.id}`}
                        className="btn-rose"
                        style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                      >
                        <NotebookPen size={13} /> Fill Out Shoot Notes
                      </Link>
                    )}
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
