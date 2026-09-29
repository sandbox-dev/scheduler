import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui";
import { getMyAssignments, getMyStaffAccount, getShootNotesDone, getStaffPortalCrew } from "@/lib/data";
import { SHOOT_NOTES_INTRO, SHOOT_NOTES_TITLE } from "@/lib/shootNotes";
import { ShootNotesForm } from "./ShootNotesForm";

// The team's Shoot Notes form for one picture day (replaces the Google Form,
// 2026-09-29). Only someone on that day's team can open it; once anyone has
// sent it, it just says so.
export default async function ShootNotesPage({ params }: { params: Promise<{ pictureDayId: string }> }) {
  const { pictureDayId } = await params;
  const account = await getMyStaffAccount();
  const mine = account ? (await getMyAssignments(account.id, "2000-01-01", "2100-12-31")).find((a) => a.picture_day.id === pictureDayId) : undefined;

  const shell = (children: React.ReactNode) => (
    <div style={{ padding: 16, maxWidth: 460, margin: "0 auto" }}>
      <Link href="/team" className="btn-secondary" style={{ display: "inline-flex", marginBottom: 12 }}>
        <ChevronLeft size={14} /> Your Jobs
      </Link>
      <Card>{children}</Card>
    </div>
  );

  if (!account || !mine) return shell(<div style={{ fontSize: 16, color: "var(--muted)" }}>This picture day isn&apos;t on your schedule.</div>);

  const [done, crews] = await Promise.all([getShootNotesDone([pictureDayId]), getStaffPortalCrew([pictureDayId])]);
  const date = new Date(`${mine.picture_day.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const header = (
    <div style={{ marginBottom: 16 }}>
      <div className="display" style={{ fontSize: 21, fontWeight: 800 }}>{SHOOT_NOTES_TITLE}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{mine.school?.name ?? mine.job.name}</div>
      <div style={{ fontSize: 14.5, color: "var(--muted)" }}>{date}</div>
    </div>
  );

  if (done.has(pictureDayId)) {
    return shell(
      <>
        {header}
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--good)" }}>✓ Shoot Notes are done for this day. Thank you!</div>
      </>
    );
  }

  const team = [...new Set([...(crews.get(pictureDayId) ?? []).map((c) => c.name), account.name])];
  return shell(
    <>
      {header}
      <div style={{ fontSize: 15, color: "var(--muted)", marginBottom: 18 }}>{SHOOT_NOTES_INTRO}</div>
      <ShootNotesForm pictureDayId={pictureDayId} team={team} me={account.name} />
    </>
  );
}
