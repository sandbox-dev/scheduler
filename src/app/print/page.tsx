import { getJobs, getScheduleAssignments, getStaff, getTimelineBuilderBackdrops } from "@/lib/data";
import { PrintSheet } from "./PrintSheet";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, assignments] = await Promise.all([getJobs(), getStaff(), getScheduleAssignments()]);
  const backdrops = await getTimelineBuilderBackdrops(jobs.map((j) => j.id));
  return <PrintSheet jobs={jobs} staff={staff} assignments={assignments} week={sp.week} backdrops={backdrops} />;
}
