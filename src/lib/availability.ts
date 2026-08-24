import type { AvailabilityLink } from "@/lib/data";

// Who the reminder cron should consider "was asked for this month and hasn't
// answered yet" after a send, given who the link already had recorded.
//
// The whole point is that this ACCUMULATES rather than replaces. Sending a
// follow-up request to one late-added staff member used to overwrite
// availability_links.staff_ids with just that person, which silently dropped
// everyone else still outstanding from both the 24h reminder and the
// deadline-missed notice — invisibly, at exactly the moment it mattered.
// Adding to the list can only ever widen who gets reminded, and anyone who
// has actually submitted is filtered out downstream by getPendingStaff, so a
// wider list never means reminding someone who already answered.
//
// `null` means "everyone active" (the pre-staff_ids behaviour, still stored
// by API callers who omit staffIds, and the widest scope there is — so it
// stays null rather than being narrowed to an explicit list).
//
// previouslySent distinguishes "null because a previous send covered
// everyone" from "null because this link has never been sent" — the latter
// must NOT be treated as everyone, or a first-ever narrow send would remind
// the entire staff list (the real 2026-08-14 incident).
export function mergeAskedStaffIds(
  previous: string[] | null,
  previouslySent: boolean,
  sendingTo: string[] | undefined
): string[] | null {
  if (!sendingTo) return null; // this send covers everyone active
  if (!previouslySent) return [...new Set(sendingTo)];
  if (previous === null) return null; // an earlier send already covered everyone
  return [...new Set([...previous, ...sendingTo])];
}

// A link counts as already sent once it has a deadline, which every send
// writes and nothing else does.
export function linkHasBeenSent(link: Pick<AvailabilityLink, "deadline_at"> | null): boolean {
  return !!link?.deadline_at;
}
