import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { CATEGORIES, type Category } from "@/lib/types";

// Receives a "booking created" event from Pixifi via a Zapier "Webhooks by
// Zapier" action and creates a bare-bones Job + Picture Day(s) — setups,
// supervisor, indoor/outdoor, and group photo are always left for an owner
// to confirm on the Jobs page afterward, per the studio's usual workflow.
//
// Auth: the request must include a header `x-webhook-secret` matching
// ZAPIER_WEBHOOK_SECRET (set that same value in the Zap's headers).
//
// Pixifi books one Event per Picture Day, so a 2-day school booking sends
// two separate webhook calls. A call for a school that already has a Job
// with a Picture Day within 7 days is treated as another day of that same
// booking round and merged in; further out (e.g. a makeup day weeks later)
// starts a new Job instead, since that's a separate booking round.
//
// Expected JSON body:
// {
//   "name": "Jefferson Elementary",       // required
//   "client": "Jefferson Elementary",     // optional, defaults to name
//   "category": "K-12",                   // required — "Preschool" or "K-12" (qualification bucket)
//   "school_type": "TK-8",                // optional — actual grade range, for reference only
//   "enrollment": 250,                    // optional — number of students, for reference only
//   "dates": ["2026-09-10", "2026-09-11"],// required — at least one date (YYYY-MM-DD)
//   "setups": 3,                          // optional — omit if unknown; flagged for review if missing
//   "school_name": "Jefferson Elementary",// optional — matches/creates a saved school
//   "school_address": "123 Main St, ...", // optional
//   "round_trip_miles": 32                // optional, applied to every date
// }
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.ZAPIER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Zapier's JSON body is a plain-text template with no conditional logic,
  // so numeric fields are sent as quoted strings (safe even when blank,
  // e.g. enrollment isn't always known yet) — accept a numeric string the
  // same as a real number.
  const toNumber = (v: unknown): number | null => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
    return null;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const client = typeof body.client === "string" && body.client.trim() ? body.client.trim() : name;
  const category = body.category as Category;
  const schoolType = typeof body.school_type === "string" ? body.school_type.trim() : "";
  const enrollment = toNumber(body.enrollment);
  const dates = Array.isArray(body.dates)
    ? body.dates.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];
  const parsedSetups = toNumber(body.setups);
  const hasSetups = parsedSetups !== null && parsedSetups >= 1;
  const setups = hasSetups ? (parsedSetups as number) : 1;
  const schoolName = typeof body.school_name === "string" ? body.school_name.trim() : "";
  const schoolAddress = typeof body.school_address === "string" ? body.school_address.trim() : "";
  const roundTripMiles = typeof body.round_trip_miles === "number" ? body.round_trip_miles : 0;

  if (!name) return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Missing or invalid "category" — must be one of: ${CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }
  if (dates.length === 0) {
    return NextResponse.json({ error: "Missing required field: dates (array of YYYY-MM-DD strings)" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  // Find an existing Job for this school with a Picture Day within a week
  // of this booking — same booking round, just another day coming in as a
  // separate Pixifi Event. Anything further out starts a new Job.
  const MERGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const incomingTime = new Date(dates[0]).getTime();
  const { data: candidateJobs } = await supabase
    .from("jobs")
    .select("id, picture_days(date)")
    .eq("name", name);
  const existingJob = (candidateJobs ?? []).find((job) =>
    job.picture_days.some(
      (d: { date: string }) => Math.abs(new Date(d.date).getTime() - incomingTime) <= MERGE_WINDOW_MS
    )
  );

  if (existingJob) {
    // Avoid creating a duplicate if Zapier retries or re-sends the same booking.
    if (existingJob.picture_days.some((d: { date: string }) => d.date === dates[0])) {
      return NextResponse.json({ ok: true, skipped: "duplicate", job_id: existingJob.id });
    }

    const { error: daysError } = await supabase.from("picture_days").insert(
      dates.map((date) => ({
        job_id: existingJob.id,
        date,
        setups,
        round_trip_miles: roundTripMiles,
        needs_review: !hasSetups,
      }))
    );

    if (daysError) {
      return NextResponse.json({ error: "Matched an existing job, but Picture Day failed to save" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, job_id: existingJob.id, picture_days: dates.length, added_to_existing: true });
  }

  let schoolId: string | null = null;
  if (schoolName) {
    const { data: existingSchool } = await supabase
      .from("schools")
      .select("id")
      .ilike("name", schoolName)
      .maybeSingle();

    if (existingSchool) {
      schoolId = existingSchool.id;
    } else {
      const { data: newSchool, error: schoolError } = await supabase
        .from("schools")
        .insert({ name: schoolName, address: schoolAddress, round_trip_miles: roundTripMiles })
        .select("id")
        .single();
      if (!schoolError && newSchool) schoolId = newSchool.id;
    }
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({ name, client, category, school_id: schoolId, school_type: schoolType, enrollment })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Couldn't create job" }, { status: 500 });
  }

  const { error: daysError } = await supabase.from("picture_days").insert(
    dates.map((date) => ({
      job_id: job.id,
      date,
      setups,
      round_trip_miles: roundTripMiles,
      needs_review: !hasSetups,
    }))
  );

  if (daysError) {
    return NextResponse.json({ error: "Job created, but Picture Days failed to save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: job.id, picture_days: dates.length });
}
