import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getJobs, getScheduleAssignments, getStaff } from "@/lib/data";
import { flattenJobDays, mileageReport } from "@/lib/scheduling";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startDate = request.nextUrl.searchParams.get("start");
  const endDate = request.nextUrl.searchParams.get("end");
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
  }

  const [jobs, staff, assignments] = await Promise.all([getJobs(), getStaff(), getScheduleAssignments()]);

  const pictureDaysById: Record<string, { date: string; round_trip_miles: number }> = {};
  flattenJobDays(jobs).forEach((jd) => {
    pictureDaysById[jd.id] = { date: jd.date, round_trip_miles: jd.round_trip_miles };
  });

  const rows = mileageReport(assignments, pictureDaysById, staff.filter((s) => s.mileage_eligible), startDate, endDate);

  const header = "Employee,Days Worked,Round-Trip Miles,Mileage Pay ($)\n";
  const body = rows.map((r) => `${r.name},${r.daysWorked},${r.miles},${r.pay.toFixed(2)}`).join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="mileage_${startDate}_to_${endDate}.csv"`,
    },
  });
}
