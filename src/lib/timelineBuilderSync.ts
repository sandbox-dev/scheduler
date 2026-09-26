import type { SupabaseClient } from "@supabase/supabase-js";

// Booking facts (dates, how many days, setups, dedicated group photographer)
// live here, and a Timeline Builder job imported from this booking follows
// them. This asks Timeline Builder's own routine — sync_tb_job_from_scheduler,
// in timeline-builder/supabase/schema.sql, the one both apps use — to catch
// every linked job up right now, instead of waiting for someone to open it
// there. Best-effort: the save here already happened, and Timeline Builder
// re-checks on open, so a problem is logged rather than failing the save.
export async function syncTimelineBuilderJobs(supabase: SupabaseClient, schedulerJobId: string): Promise<void> {
  try {
    const { data: linked, error } = await supabase.from("tb_jobs").select("id").eq("scheduler_job_id", schedulerJobId);
    if (error) throw error;
    for (const job of linked ?? []) {
      const { error: syncError } = await supabase.rpc("sync_tb_job_from_scheduler", { p_tb_job_id: job.id });
      if (syncError) throw syncError;
    }
  } catch (err) {
    console.error("syncTimelineBuilderJobs failed — Timeline Builder will catch up when the job is opened", err);
  }
}
