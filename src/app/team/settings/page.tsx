import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui";
import { getMyStaffAccount } from "@/lib/data";
import { TeamTopBar } from "../TeamTopBar";
import { SharePhoneSetting } from "../SharePhonePrompt";

// The team app's Settings (2026-10-02) — phone sharing for now; availability
// is meant to move in here later so staff do it all in one place.
export default async function TeamSettingsPage() {
  const account = await getMyStaffAccount();
  if (!account) return null;
  return (
    <div style={{ minHeight: "100dvh" }}>
      <TeamTopBar firstName={account.name.split(" ")[0]} />
      <div style={{ padding: 16, maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <Link href="/team" className="btn-secondary" style={{ alignSelf: "flex-start" }}>
          <ChevronLeft size={14} /> Your Jobs
        </Link>
        <div className="display" style={{ fontSize: 19, fontWeight: 800 }}>Settings</div>
        <Card>
          <SharePhoneSetting current={account.share_phone ?? null} />
        </Card>
      </div>
    </div>
  );
}
