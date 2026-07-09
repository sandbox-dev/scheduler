import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Bypasses Row Level Security — only for trusted server-to-server routes
// (like the Zapier webhook) that have no logged-in owner session to satisfy
// the normal "owners only" policies, but authenticate some other way first.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
