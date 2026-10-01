import Image from "next/image";
import { Card } from "@/components/ui";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SetPasswordForm } from "./SetPasswordForm";

export const metadata = { title: "Set Up Your Account — Sandbox Photographers", robots: { index: false, follow: false } };

// Where a team app invite lands (Staff page → Invite To Team App).
export default async function TeamWelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  const { data: staff } = valid
    ? await createServiceRoleClient().from("staff").select("name, team_invite_expires_at").eq("team_invite_token", token).maybeSingle()
    : { data: null };
  const ok = !!staff?.team_invite_expires_at && new Date(staff.team_invite_expires_at) > new Date();
  return (
    <div style={{ padding: 16, maxWidth: 420, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
        <Image src="/logo.png" alt="Sandbox Photographers" width={110} height={44} style={{ objectFit: "contain" }} priority />
      </div>
      <Card>
        {ok ? (
          <>
            <div className="display" style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Welcome, {(staff!.name as string).split(" ")[0]}!</div>
            <div style={{ fontSize: 15, color: "var(--muted)", marginBottom: 16 }}>Choose a password for the Sandbox team app. You&apos;ll use it with your email to sign in.</div>
            <SetPasswordForm token={token} />
          </>
        ) : (
          <div style={{ fontSize: 16 }}>This link has expired or was already used. Please ask Sandbox Photographers for a new one, or <a href="/team/login">sign in</a>.</div>
        )}
      </Card>
    </div>
  );
}
