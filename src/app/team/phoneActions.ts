"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The staff member's own choice to share their number with teammates.
export async function setSharePhone(share: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_set_share_phone", { p_share: share });
  if (error) throw new Error("Couldn't save that — please try again.");
  revalidatePath("/team");
}
