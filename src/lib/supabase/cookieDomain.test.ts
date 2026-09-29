import { describe, expect, it } from "vitest";
import { isSupabaseAuthCookie, sharedCookieDomain } from "./cookieDomain";

describe("sharedCookieDomain", () => {
  it("shares across our subdomains", () => {
    for (const h of ["hub.sandboxphotographers.com", "portal.sandboxphotographers.com", "team.sandboxphotographers.com", "TEAM.sandboxphotographers.com:443"]) {
      expect(sharedCookieDomain(h)).toBe(".sandboxphotographers.com");
    }
  });
  it("stays host-only everywhere else", () => {
    for (const h of ["localhost:3000", "scheduler-eight-jet.vercel.app", "evilsandboxphotographers.com", "sandboxphotographers.com.evil.com", "", null]) {
      expect(sharedCookieDomain(h)).toBeUndefined();
    }
  });
  it("only migrates Supabase login cookies, not the marker", () => {
    expect(isSupabaseAuthCookie("sb-abc-auth-token")).toBe(true);
    expect(isSupabaseAuthCookie("sb-abc-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookie("sb-shared-login")).toBe(false);
    expect(isSupabaseAuthCookie("other")).toBe(false);
  });
});
