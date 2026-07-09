import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getJobs, getScheduleAssignments, getStaff } from "@/lib/data";
import { buildStaffScheduleRows, neededDatesSummary, fmtDate } from "@/lib/scheduling";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}-01$/.test(month)) {
    return NextResponse.json({ error: "Missing or invalid month (expected YYYY-MM-01)" }, { status: 400 });
  }

  const [jobs, staff, assignments] = await Promise.all([getJobs(), getStaff(), getScheduleAssignments()]);

  const needed = neededDatesSummary(jobs).filter((n) => n.date.startsWith(month.slice(0, 7)));
  const assignmentsByDay = new Map<string, typeof assignments>();
  assignments.forEach((a) => {
    const list = assignmentsByDay.get(a.picture_day_id) || [];
    list.push(a);
    assignmentsByDay.set(a.picture_day_id, list);
  });
  const rowsByStaffId = buildStaffScheduleRows(needed, assignmentsByDay, new Map());

  const rows: { staffName: string; date: string; role: string; jobName: string }[] = [];
  staff.forEach((s) => {
    (rowsByStaffId.get(s.id) || []).forEach((r) => {
      rows.push({ staffName: s.name, date: r.date, role: r.role, jobName: r.jobName });
    });
  });
  rows.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.date.localeCompare(b.date));

  const escapeCsv = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = "Staff,Date,Role,School\n";
  const body = rows
    .map((r) => {
      const { wd, md } = fmtDate(r.date);
      return [r.staffName, `${wd} ${md}`, r.role, r.jobName].map(escapeCsv).join(",");
    })
    .join("\n");

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="schedule_${month.slice(0, 7)}.csv"`,
    },
  });
}
