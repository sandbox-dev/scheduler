"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Sets the password from a team app invite link, then signs them in.
export async function setTeamPassword(token: string, password: string, sharePhone: boolean | null = null): Promise<{ error: string } | void> {
  if (password.length < 8) return { error: "Please use at least 8 characters." };
  const admin = createServiceRoleClient();
  const { data: staff } = await admin
    .from("staff")
    .select("id, email, auth_user_id, team_invite_expires_at")
    .eq("team_invite_token", token)
    .maybeSingle();
  if (!staff?.auth_user_id || !staff.team_invite_expires_at || new Date(staff.team_invite_expires_at) < new Date()) {
    return { error: "This link has expired. Please ask Sandbox Photographers for a new one." };
  }
  const { error } = await admin.auth.admin.updateUserById(staff.auth_user_id, { password });
  if (error) return { error: "Couldn't save that password — please try another." };
  await admin
    .from("staff")
    .update({ team_invite_token: null, team_invite_expires_at: null, ...(sharePhone === null ? {} : { share_phone: sharePhone }) })
    .eq("id", staff.id);

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: staff.email, password });
  if (signInError) redirect("/team/login");
  redirect("/team");
}
