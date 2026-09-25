"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  // Only owners (app_owners) and team logins (staff.auth_user_id) have any
  // access — see the OWNERS LIST block at the end of schema.sql. Anyone else
  // (a school contact's login, say) would just see an empty app.
  // Only turns someone away on a clear "no" from both — the database's own
  // policies are the real lock, so a lookup that errors doesn't lock an owner
  // out of the sign-in page over a message.
  const [owner, staff] = await Promise.all([supabase.rpc("is_owner"), supabase.rpc("is_staff_account")]);
  if (!owner.error && !staff.error && owner.data !== true && staff.data !== true) {
    await supabase.auth.signOut();
    return { error: "This login doesn't have access. Please check with Sandbox Photographers." };
  }

  redirect("/overview");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
