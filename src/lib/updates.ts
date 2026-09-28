import type { SupabaseClient } from "@supabase/supabase-js";

// What's New — one shared list for both apps (Adi, 2026-09-27). It's written
// in Timeline Builder (src/lib/updates.ts there) and copied into
// tb_app_updates; this app only reads it. Seen = opened What's New in either
// app (tb_update_reads).
export type AppUpdate = { id: string; posted_on: string; app: string; title: string; body: string };

export async function getUpdates(supabase: SupabaseClient): Promise<AppUpdate[]> {
  try {
    const { data, error } = await supabase.from("tb_app_updates").select("id, posted_on, app, title, body").order("posted_on", { ascending: false }).order("id", { ascending: false });
    if (error) throw error;
    return (data ?? []) as AppUpdate[];
  } catch (err) {
    console.error("getUpdates failed", err);
    return [];
  }
}

export async function seenUpdateIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  try {
    const { data } = await supabase.from("tb_update_reads").select("seen_ids").eq("user_id", userId).maybeSingle();
    return new Set((data?.seen_ids ?? []) as string[]);
  } catch {
    return new Set();
  }
}

export async function markUpdatesSeen(supabase: SupabaseClient, userId: string, ids: string[]): Promise<void> {
  try {
    await supabase.from("tb_update_reads").upsert({ user_id: userId, seen_ids: ids, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  } catch (err) {
    console.error("markUpdatesSeen failed", err);
  }
}

// Clearing is manual (Adi, 2026-09-28) — adds to what this login has read.
export async function addSeenUpdateIds(supabase: SupabaseClient, userId: string, ids: string[]): Promise<void> {
  const seen = await seenUpdateIds(supabase, userId);
  ids.forEach((id) => seen.add(id));
  await markUpdatesSeen(supabase, userId, [...seen]);
}
