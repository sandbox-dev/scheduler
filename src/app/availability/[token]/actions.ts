"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitAvailability(
  token: string,
  staffId: string,
  pictureDayId: string,
  available: boolean
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_availability", {
    p_token: token,
    p_staff_id: staffId,
    p_picture_day_id: pictureDayId,
    p_available: available,
  });
  if (error) throw new Error("Couldn't save — the link may have expired.");
}

export async function submitAvailabilityNote(token: string, staffId: string, note: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_availability_note", {
    p_token: token,
    p_staff_id: staffId,
    p_note: note,
  });
  if (error) throw new Error("Couldn't save — the link may have expired.");
}
