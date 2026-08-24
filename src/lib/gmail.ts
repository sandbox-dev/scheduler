import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Sends through the studio's own connected Gmail account, exactly like the
// timeline-builder app does — the message lands in Adi's real Sent folder and
// replies come back to her real inbox.
//
// This app has no "Connect Gmail" screen of its own on purpose. Both apps
// point at the SAME Supabase project, so the refresh token timeline-builder
// stored in tb_app_settings is already here; reading it means one connection
// to maintain, and reconnecting Gmail over there fixes both apps at once.
//
// Replaces the Zapier catch-hook relay these emails used to go through. A
// webhook POST can only ever confirm "Zapier accepted the handoff," which is
// not the same as an email existing — a real send in this system got a 2xx
// back and never became a Zapier task (2026-08-07), and nothing surfaced it
// for weeks. Gmail's API answers the actual question, so the app can now
// tell the owner what really happened instead of what it hoped happened.
async function getStoredRefreshToken(): Promise<string | null> {
  // Service-role rather than the cookie-based client: the reminder cron and
  // the staff-facing submit action both send email with no logged-in owner
  // session, and tb_app_settings' RLS only grants reads to `authenticated`.
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("tb_app_settings").select("google_refresh_token").eq("id", true).single();
  if (error) throw error;
  return (data?.google_refresh_token as string | null) ?? null;
}

async function getGmailAccessToken(): Promise<string> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) {
    throw new Error("Gmail isn't connected — connect it on the timeline app's Settings page, which both apps share.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error("Google rejected the stored Gmail connection — reconnect Gmail on the timeline app's Settings page.");
  }
  const json = await res.json();
  return json.access_token as string;
}

// RFC 2047-encodes the subject so a non-ASCII school or staff name survives.
function encodeHeader(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, "utf-8").toString("base64")}?=`;
}

// Gmail wants the raw RFC 2822 message base64url-encoded (RFC 4648 §5, unpadded).
function base64UrlEncode(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type GmailSendResult = { ok: true } | { ok: false; error: string };

// Never throws — every caller here is sending to a list of people and must
// carry on to the rest (and report exactly who missed out) rather than
// aborting the batch on one bad address.
//
// No "From" header: omitting it lets Gmail fill in the authenticated
// account's own name and address, which is the only valid way to send as
// yourself through this API.
export async function sendGmailMessage({
  to,
  subject,
  htmlBody,
  replyTo,
}: {
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
}): Promise<GmailSendResult> {
  try {
    const accessToken = await getGmailAccessToken();
    const headerLines = [`To: ${to}`, `Subject: ${encodeHeader(subject)}`, `Content-Type: text/html; charset="UTF-8"`];
    if (replyTo) headerLines.push(`Reply-To: ${replyTo}`);
    const rawMessage = [...headerLines, "", htmlBody].join("\r\n");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64UrlEncode(rawMessage) }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`Gmail send to ${to} failed (${res.status}): ${detail}`);
      return { ok: false, error: `Gmail refused the send (${res.status})` };
    }
    return { ok: true };
  } catch (err) {
    console.error(`Gmail send to ${to} threw`, err);
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Gmail" };
  }
}

// True if the shared Gmail connection is usable, so a page can say "email
// isn't set up" up front rather than after a failed send.
export async function isGmailConnected(): Promise<boolean> {
  try {
    return !!(await getStoredRefreshToken());
  } catch {
    return false;
  }
}
