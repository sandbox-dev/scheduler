"use server";

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendGmailMessage } from "@/lib/gmail";

const INVITE_DAYS = 14;

function teamBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://team.sandboxphotographers.com").replace(/\/$/, "");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Finds an existing login with this email (e.g. Luis/Kristen's test logins).
async function findUserIdByEmail(admin: ReturnType<typeof createServiceRoleClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export type TeamAccessResult = { ok: true; message: string } | { error: string };

// Invite To Team App / Resend Invite (Adi, 2026-10-01).
export async function inviteToTeamApp(staffId: string): Promise<TeamAccessResult> {
  const admin = createServiceRoleClient();
  const { data: staff } = await admin.from("staff").select("id, name, email, auth_user_id, team_invite_expires_at").eq("id", staffId).maybeSingle();
  if (!staff) return { error: "Couldn't find that staff member." };
  const email = (staff.email ?? "").trim();
  if (!email) return { error: `Add an email for ${staff.name} first.` };

  let userId = staff.auth_user_id as string | null;
  if (!userId) {
    userId = await findUserIdByEmail(admin, email);
    if (userId) {
      const { data: owner } = await admin.from("app_owners").select("user_id").eq("user_id", userId).maybeSingle();
      if (owner) return { error: `${email} is an owner login — use a different email for ${staff.name}'s team app login.` };
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password: randomBytes(24).toString("base64url") });
      if (error || !created.user) return { error: "Couldn't create the login — please try again." };
      userId = created.user.id;
    }
  }

  const token = randomUUID();
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const { error: linkError } = await admin
    .from("staff")
    .update({ auth_user_id: userId, team_invite_token: token, team_invite_expires_at: expires.toISOString(), team_invited_at: new Date().toISOString() })
    .eq("id", staffId);
  if (linkError) return { error: "Couldn't link the login — please try again." };

  const first = (staff.name as string).split(" ")[0];
  // Already set up (e.g. a forgotten password): same link, reset wording.
  const isReset = !!staff.auth_user_id && !staff.team_invite_expires_at;
  const link = `${teamBase()}/team/welcome/${token}`;
  const sent = await sendGmailMessage({
    to: email,
    subject: isReset ? "Reset your Sandbox team app password" : "Your Sandbox team app login",
    htmlBody: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#20232B;">
<p style="margin:0 0 14px;">Hi ${esc(first)},</p>
<p style="margin:0 0 14px;">${isReset ? "Here's a link to choose a new password for the Sandbox team app:" : "Your schedule, each picture day's details and timeline, and Shoot Notes now all live in the Sandbox team app. Set up your login here:"}</p>
<p style="margin:20px 0;"><a href="${link}" style="display:inline-block;background:#3D5A6C;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">${isReset ? "RESET YOUR PASSWORD" : "SET UP YOUR ACCOUNT"}</a></p>
<p style="margin:0 0 14px;">You'll choose a password${isReset ? "" : " and say whether to share your phone number with your team (so they can call or text you on picture days)"}, then you're in. This link works for ${INVITE_DAYS} days.</p>
${isReset ? "" : `<p style="margin:0 0 14px;"><strong>Tip:</strong> once you're in, add it to your phone's home screen (Share, then Add to Home Screen on iPhone), and tap Subscribe to your calendar so your picture days show up there too.</p>`}
<p style="margin:24px 0 0;color:#6B7280;font-size:13px;">— Sandbox Photographers</p></div>`,
  });
  revalidatePath("/staff");
  if (!sent.ok) return { error: `The login is set up, but the email didn't send (${sent.error}). Try Resend Invite.` };
  return { ok: true, message: isReset ? `✓ Password reset link sent to ${email}.` : `✓ Invite sent to ${email}.` };
}

// Remove Team App Access — deletes their login, so they can't sign in.
export async function removeTeamAccess(staffId: string): Promise<TeamAccessResult> {
  const admin = createServiceRoleClient();
  const { data: staff } = await admin.from("staff").select("name, auth_user_id").eq("id", staffId).maybeSingle();
  if (!staff) return { error: "Couldn't find that staff member." };
  const userId = staff.auth_user_id as string | null;
  const { error } = await admin.from("staff").update({ auth_user_id: null, team_invite_token: null, team_invite_expires_at: null, team_invited_at: null }).eq("id", staffId);
  if (error) return { error: "Couldn't remove access — please try again." };
  if (userId) {
    const { data: owner } = await admin.from("app_owners").select("user_id").eq("user_id", userId).maybeSingle();
    if (!owner) await admin.auth.admin.deleteUser(userId);
  }
  revalidatePath("/staff");
  return { ok: true, message: `✓ ${staff.name} can no longer sign in to the team app.` };
}
