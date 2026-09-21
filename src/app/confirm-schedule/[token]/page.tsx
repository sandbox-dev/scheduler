import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/month";
import { Card } from "@/components/ui";
import { ConfirmButton } from "./ConfirmButton";

type ConfirmationData = { error?: string; staff_name: string; month: string; confirmed_at: string | null };

export default async function ConfirmSchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_schedule_confirmation", { p_token: token });
  const result = data as ConfirmationData | null;

  const invalid = error || !result || result.error;

  return (
    <div style={{ minHeight: "100dvh", padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        <Image src="/logo.png" alt="Sandbox Photographers" width={120} height={48} style={{ objectFit: "contain" }} priority />
        <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Picture Day schedule</div>
      </div>

      {invalid ? (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
            This link has expired or isn&apos;t valid. Please reply to your schedule email and let us know.
          </div>
        </Card>
      ) : (
        <Card>
          {result.confirmed_at ? (
            <div style={{ fontSize: 14 }}>
              Already confirmed on {new Date(result.confirmed_at).toLocaleDateString(undefined, { dateStyle: "long" })} — thanks!
            </div>
          ) : (
            <ConfirmButton token={token} staffName={result.staff_name} monthLabel={monthLabel(result.month)} />
          )}
        </Card>
      )}
    </div>
  );
}
