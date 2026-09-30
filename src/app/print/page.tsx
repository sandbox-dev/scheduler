import { getJobs, getScheduleAssignments, getStaff, getTimelineBuilderGear } from "@/lib/data";
import { PrintSheet } from "./PrintSheet";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, assignments] = await Promise.all([getJobs(), getStaff(), getScheduleAssignments()]);
  const { backdrops, groupPhotoJobs } = await getTimelineBuilderGear(jobs.map((j) => j.id));
  return <PrintSheet jobs={jobs} staff={staff} assignments={assignments} week={sp.week} backdrops={backdrops} groupPhotoJobs={groupPhotoJobs} />;
}
