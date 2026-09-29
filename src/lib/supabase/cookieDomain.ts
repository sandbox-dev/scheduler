// One login across hub., portal. and team.sandboxphotographers.com (Adi,
// 2026-09-28): both apps use the same Supabase project, so the session
// cookie is the same — it just has to be set on the parent domain instead of
// each host. Anywhere else (localhost, *.vercel.app previews) stays
// host-only, exactly as before.
export const SHARED_COOKIE_DOMAIN = ".sandboxphotographers.com";

export function sharedCookieDomain(host: string | null | undefined): string | undefined {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return h === "sandboxphotographers.com" || h.endsWith(".sandboxphotographers.com") ? SHARED_COOKIE_DOMAIN : undefined;
}

// Before this, each host kept its own copy of the login cookies. The first
// request on a host after the switch moves them onto the shared domain (so
// nobody gets logged out) and deletes the host-only copies (so there's never
// two competing ones). The marker is host-only on purpose: each host
// migrates its own old copies once.
export const MIGRATED_MARKER = "sb-shared-login";
export function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name !== MIGRATED_MARKER;
}
