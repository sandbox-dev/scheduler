import { describe, expect, it } from "vitest";
import { linkHasBeenSent, mergeAskedStaffIds } from "./availability";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const C = "cccccccc-0000-0000-0000-000000000003";

describe("mergeAskedStaffIds", () => {
  it("records only the chosen people on a first-ever narrow send", () => {
    // The 2026-08-14 incident: two new trainees sent their own request must
    // not put the whole already-submitted staff list on the reminder list.
    expect(mergeAskedStaffIds(null, false, [A, B])).toEqual([A, B]);
  });

  it("adds a follow-up recipient without dropping earlier ones", () => {
    // The bug this function exists to fix — [A, B] used to become [C].
    expect(mergeAskedStaffIds([A, B], true, [C])).toEqual([A, B, C]);
  });

  it("does not duplicate someone who is re-sent the request", () => {
    expect(mergeAskedStaffIds([A, B], true, [B])).toEqual([A, B]);
  });

  it("stays 'everyone' once a send has covered everyone", () => {
    expect(mergeAskedStaffIds(null, true, [C])).toBeNull();
  });

  it("treats an omitted recipient list as everyone active", () => {
    expect(mergeAskedStaffIds([A], true, undefined)).toBeNull();
    expect(mergeAskedStaffIds(null, false, undefined)).toBeNull();
  });

  it("widens to a superset when a narrow send is followed by send-to-everyone", () => {
    expect(mergeAskedStaffIds([C], true, [A, B, C])).toEqual([C, A, B]);
  });
});

describe("linkHasBeenSent", () => {
  it("is false for a freshly generated link and true once a deadline is set", () => {
    expect(linkHasBeenSent(null)).toBe(false);
    expect(linkHasBeenSent({ deadline_at: null })).toBe(false);
    expect(linkHasBeenSent({ deadline_at: "2026-08-15T17:00:00.000Z" })).toBe(true);
  });
});
