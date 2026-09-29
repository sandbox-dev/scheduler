import { getJobs, getScheduleAssignments, getStaff } from "@/lib/data";
import { PrintSheet } from "./PrintSheet";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const [jobs, staff, assignments] = await Promise.all([getJobs(), getStaff(), getScheduleAssignments()]);
  return <PrintSheet jobs={jobs} staff={staff} assignments={assignments} week={sp.week} />;
}
