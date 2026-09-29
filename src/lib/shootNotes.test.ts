import { describe, expect, it } from "vitest";
import { missingShootNotes, type ShootNotesAnswers } from "./shootNotes";

const full: ShootNotesAnswers = {
  filled_by: ["Luis"], individual_as_expected: true, individual_note: "", on_time: true, timeline_note: "",
  parking_as_described: true, parking_note: "", group_as_expected: true, group_note: "", other_notes: "", next_time: "",
};

describe("missingShootNotes", () => {
  it("all Yes is complete", () => expect(missingShootNotes(full)).toEqual([]));
  it("needs a name", () => expect(missingShootNotes({ ...full, filled_by: [] })).toHaveLength(1));
  it("needs every question answered", () => expect(missingShootNotes({ ...full, on_time: null })).toEqual(['"Timeline - On time?"']));
  it("a No needs its details", () => {
    expect(missingShootNotes({ ...full, on_time: false })).toEqual(['details for "Timeline - On time?"']);
    expect(missingShootNotes({ ...full, on_time: false, timeline_note: "15 min over" })).toEqual([]);
  });
});
