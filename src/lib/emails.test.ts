import { describe, expect, it } from "vitest";
import {
  allSubmittedEmail,
  availabilityReminderEmail,
  availabilityRequestEmail,
  deadlineMissedEmail,
  escapeHtml,
  scheduleApprovedEmail,
  staffSubmittedEmail,
} from "./emails";

const BASE = {
  staffName: "Sarah Chen",
  monthLabel: "September 2026",
  link: "https://scheduler.example.com/availability/abc123",
  pin: "4417",
  deadlineLabel: "September 1, 2026 at 5:00 PM",
};

describe("escapeHtml", () => {
  it("neutralises markup in names that come from the database", () => {
    // Staff and school names are free text an owner types — they must never
    // be able to break the email's markup or inject a link.
    expect(escapeHtml(`<script>x</script>`)).toBe("&lt;script&gt;x&lt;/script&gt;");
    expect(escapeHtml(`O'Brien & Sons "Academy"`)).toBe("O&#39;Brien &amp; Sons &quot;Academy&quot;");
  });
});

describe("availabilityRequestEmail", () => {
  it("carries the person's own PIN, their link and the deadline", () => {
    const { subject, htmlBody } = availabilityRequestEmail(BASE);
    expect(subject).toBe("Your September 2026 Picture Day availability");
    expect(htmlBody).toContain("Sarah Chen");
    expect(htmlBody).toContain("4417");
    expect(htmlBody).toContain(BASE.link);
    expect(htmlBody).toContain("September 1, 2026 at 5:00 PM");
  });

  it("explains itself differently when it's a reopen", () => {
    // Without this the recipient just sees a duplicate of a request they
    // already answered, and reasonably ignores it.
    const { subject, htmlBody } = availabilityRequestEmail({ ...BASE, reopened: true });
    expect(subject).toBe("Update your September 2026 Picture Day availability");
    expect(htmlBody).toContain("reopened");
    expect(htmlBody).toContain("already ticked");
  });

  it("falls back to a readable sentence when no deadline is set", () => {
    const { htmlBody } = availabilityRequestEmail({ ...BASE, deadlineLabel: null });
    expect(htmlBody).toContain("as soon as you can");
    expect(htmlBody).not.toContain("Please respond by <strong>");
  });

  it("escapes a name containing markup", () => {
    const { htmlBody } = availabilityRequestEmail({ ...BASE, staffName: "<b>Sarah</b>" });
    expect(htmlBody).not.toContain("<b>Sarah</b>");
    expect(htmlBody).toContain("&lt;b&gt;Sarah&lt;/b&gt;");
  });
});

describe("availabilityReminderEmail", () => {
  it("leads with the deadline, since that's the reason it's arriving", () => {
    const { subject, htmlBody } = availabilityReminderEmail(BASE);
    expect(subject).toContain("September 1, 2026 at 5:00 PM");
    expect(htmlBody).toContain("4417");
    expect(htmlBody).toContain(BASE.link);
  });
});

describe("deadlineMissedEmail", () => {
  it("lists every missing person by name", () => {
    const { subject, htmlBody } = deadlineMissedEmail({
      monthLabel: "September 2026",
      deadlineLabel: "September 1, 2026 at 5:00 PM",
      missingNames: ["Sarah Chen", "Marcus Webb"],
    });
    expect(subject).toContain("2 staff");
    expect(htmlBody).toContain("Sarah Chen");
    expect(htmlBody).toContain("Marcus Webb");
  });

  it("uses singular wording for one person", () => {
    const { htmlBody } = deadlineMissedEmail({
      monthLabel: "September 2026",
      deadlineLabel: "September 1, 2026 at 5:00 PM",
      missingNames: ["Sarah Chen"],
    });
    expect(htmlBody).toContain("1 person");
    expect(htmlBody).not.toContain("1 people");
  });
});

describe("studio notifications", () => {
  it("links straight to the person's row on the tracker", () => {
    const trackerLink = "https://scheduler.example.com/availability-tracker?month=2026-09-01#staff-abc";
    expect(staffSubmittedEmail({ staffName: "Sarah Chen", monthLabel: "September 2026", trackerLink }).htmlBody).toContain(
      trackerLink
    );
    expect(allSubmittedEmail({ monthLabel: "September 2026", trackerLink }).htmlBody).toContain(trackerLink);
  });
});

describe("scheduleApprovedEmail", () => {
  it("lists each booked day with role and school", () => {
    const { subject, htmlBody } = scheduleApprovedEmail({
      staffName: "Sarah Chen",
      monthLabel: "September 2026",
      days: [
        { date: "Tue Sep 8", role: "Photographer", school: "Head-Royce", city: "Oakland" },
        { date: "Wed Sep 9", role: "Assistant", school: "Park Day", city: "" },
      ],
    });
    expect(subject).toBe("Your September 2026 Picture Day schedule");
    expect(htmlBody).toContain("Tue Sep 8");
    expect(htmlBody).toContain("Photographer");
    expect(htmlBody).toContain("Head-Royce");
    expect(htmlBody).toContain("(Oakland)");
    // A school with no address on file shouldn't render an empty "()".
    expect(htmlBody).not.toContain("()");
  });
});
