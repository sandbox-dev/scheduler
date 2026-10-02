import { describe, expect, it } from "vitest";
import { briefingRowToFields } from "./staffPortal";

describe("team app Details facts", () => {
  it("passes through every fact the database sends, including ones added later", () => {
    const [id, fields] = briefingRowToFields({
      picture_day_id: "d1",
      backdrop: "Gray",
      day_of_contact_name: "Dennis Ow",
      day_of_contact_phone: "415-425-0590",
      school_notes: "No photos of the gym",
      individual_location_notes: "enter from the side door",
      group_photo_location: "Field",
      group_location_notes: "by the oak",
      custom_fields: null,
    });
    expect(id).toBe("d1");
    expect(fields.day_of_contact_name).toBe("Dennis Ow");
    expect(fields.day_of_contact_phone).toBe("415-425-0590");
    expect(fields.school_notes).toBe("No photos of the gym");
    expect(fields.individual_location_notes).toBe("enter from the side door");
    expect(fields.group_photo_location).toBe("Field");
    expect(fields.group_location_notes).toBe("by the oak");
    expect(fields.custom_fields).toEqual([]);
  });
});
