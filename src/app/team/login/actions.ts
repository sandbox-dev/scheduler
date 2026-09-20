"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string } | undefined;

// Same signInWithPassword pattern as the owner login (src/app/login/actions.ts)
// — the only difference is where a successful sign-in lands. The proxy
// (src/lib/supabase/proxy-session.ts) is what actually decides whether this
// login is staff-scoped or an owner and routes /team vs /overview from then
// on; this redirect is just the first hop right after signing in.
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

  redirect("/team");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/team/login");
}
