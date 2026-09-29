import { createBrowserClient } from "@supabase/ssr";
import { sharedCookieDomain } from "./cookieDomain";

export function createClient() {
  const domain = typeof window === "undefined" ? undefined : sharedCookieDomain(window.location.hostname);
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    domain ? { cookieOptions: { domain } } : undefined
  );
}
