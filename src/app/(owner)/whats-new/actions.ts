"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addSeenUpdateIds, getUpdates } from "@/lib/updates";

// What's New: an update stays New until it's cleared here, by hand.
export async function markUpdatesRead(ids: string[] | "all") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const all = ids === "all" ? (await getUpdates(supabase)).map((u) => u.id) : ids;
  await addSeenUpdateIds(supabase, user.id, all);
  revalidatePath("/", "layout");
}
