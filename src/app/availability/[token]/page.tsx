import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { AvailabilityForm } from "./AvailabilityForm";

type FormData = {
  error?: string;
  month: string;
  staff: { id: string; name: string }[];
  picture_days: { id: string; date: string; job_name: string; category: string }[];
  existing: { staff_id: string; picture_day_id: string; available: boolean }[];
  notes: { staff_id: string; note: string }[];
};

export default async function PublicAvailabilityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_availability_form_data", { p_token: token });
  const result = data as FormData | null;

  const invalid = error || !result || result.error;

  return (
    <div style={{ minHeight: "100dvh", padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        <Image src="/logo.png" alt="Sandbox Photographers" width={120} height={48} style={{ objectFit: "contain" }} priority />
        <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Picture Day availability</div>
      </div>

      {invalid ? (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
            This link has expired or isn&apos;t valid. Please ask the studio for a new one.
          </div>
        </Card>
      ) : result.picture_days.length === 0 ? (
        <Card>
          <div style={{ fontSize: 13.5, color: "var(--muted)" }}>No Picture Days have been booked for this month yet.</div>
        </Card>
      ) : (
        <AvailabilityForm
          token={token}
          staff={result.staff}
          pictureDays={result.picture_days}
          existing={result.existing}
          notes={result.notes}
        />
      )}
    </div>
  );
}
