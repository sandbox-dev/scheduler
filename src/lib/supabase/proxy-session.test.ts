import { describe, it, expect } from "vitest";
import { isPublicPath } from "./proxy-session";

// Regression test for a real bug caught only by hitting the deployed
// /api/calendar route for real: without it in PUBLIC_PATHS, every
// unauthenticated poll from a calendar app 307-redirected to /login instead
// of ever reaching the ICS feed (see AGENTS.md §22). Nothing else in this
// app's test suite exercises the proxy, so this is the one guard against
// silently reintroducing that class of bug for any future no-login route.
describe("isPublicPath", () => {
  it("treats /api/calendar/<token>.ics as public", () => {
    expect(isPublicPath("/api/calendar/abc123.ics")).toBe(true);
  });

  it("treats the bare /api/calendar path as public too", () => {
    expect(isPublicPath("/api/calendar")).toBe(true);
  });

  it("does not treat an unrelated path that merely starts with the same prefix as public", () => {
    expect(isPublicPath("/api/calendarfoo")).toBe(false);
  });

  it("still requires a login for an owner-only API route", () => {
    expect(isPublicPath("/api/schedule/csv")).toBe(false);
  });

  it("keeps the other existing no-login routes public (no regression)", () => {
    expect(isPublicPath("/api/webhooks/zapier/jobs")).toBe(true);
    expect(isPublicPath("/api/cron/availability-reminders")).toBe(true);
    expect(isPublicPath("/availability/sometoken")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/team/login")).toBe(true);
  });
});
