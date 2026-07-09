// One-time import of the real August 2026 data that was already captured in
// the studio's prototype file (jobs, staff, and availability responses).
//
// Run with the Supabase service role key passed inline so it never touches
// disk:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-august-2026.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envLocal = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const SUPABASE_URL = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var. Run:\n  SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-august-2026.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const schools = [
  { name: "Head-Royce School", address: "4315 Lincoln Ave, Oakland, CA 94602", round_trip_miles: 48 },
  { name: "Lodestar Community School", address: "", round_trip_miles: 66 },
];

const jobs = [
  {
    name: "Head-Royce PC Community",
    client: "Head-Royce",
    category: "Preschool",
    school: "Head-Royce School",
    days: [{ date: "2026-08-13", setups: 2, round_trip_miles: 48, requires_supervisor: false }],
  },
  {
    name: "Head-Royce School — Upper School",
    client: "Head-Royce",
    category: "K-12",
    school: "Head-Royce School",
    days: [{ date: "2026-08-17", setups: 3, round_trip_miles: 48, requires_supervisor: false }],
  },
  {
    name: "Head-Royce School — Lower School",
    client: "Head-Royce",
    category: "Elementary",
    school: "Head-Royce School",
    days: [{ date: "2026-08-18", setups: 3, round_trip_miles: 48, requires_supervisor: false }],
  },
  {
    name: "Head-Royce School — Middle School & Seniors",
    client: "Head-Royce",
    category: "K-8",
    school: "Head-Royce School",
    days: [{ date: "2026-08-19", setups: 3, round_trip_miles: 48, requires_supervisor: false }],
  },
  {
    name: "Lodestar Community School",
    client: "Lodestar",
    category: "K-8",
    school: "Lodestar Community School",
    days: [
      { date: "2026-08-27", setups: 3, round_trip_miles: 66, requires_supervisor: false },
      { date: "2026-08-28", setups: 3, round_trip_miles: 66, requires_supervisor: false },
    ],
  },
];

const ALL_CATEGORIES = ["Preschool", "K-8", "K-12", "Elementary", "Makeup Day"];

const staff = [
  { key: "kristen", name: "Kristen", roles: ["Photographer", "Assistant"], location: "Pleasant Hill", distance_miles: 25, seniority: 5, categories: ALL_CATEGORIES },
  { key: "luis", name: "Luis", roles: ["Photographer"], location: "Richmond", distance_miles: 20, seniority: 4, categories: ALL_CATEGORIES },
  { key: "laura", name: "Laura", roles: ["Assistant", "Supervisor"], location: "Oakland", distance_miles: 10, seniority: 3, categories: ALL_CATEGORIES },
  { key: "che", name: "Che", roles: ["Assistant", "Photographer"], location: "Oakland", distance_miles: 10, seniority: 3, categories: ALL_CATEGORIES },
  { key: "kawena", name: "Kawena", roles: ["Assistant"], location: "", distance_miles: 15, seniority: 2, categories: ALL_CATEGORIES },
  { key: "malia", name: "Malia", roles: ["Assistant"], location: "", distance_miles: 18, seniority: 1, categories: ALL_CATEGORIES },
  { key: "adi", name: "Adi", roles: ["Photographer", "Assistant", "Supervisor"], location: "", distance_miles: 0, seniority: 5, categories: ALL_CATEGORIES },
  { key: "julia", name: "Julia", roles: ["Photographer", "Assistant", "Supervisor"], location: "", distance_miles: 0, seniority: 5, categories: ALL_CATEGORIES },
];

// Staff who haven't responded yet (Kawena, Malia, Adi, Julia) are simply
// left out here — matching the prototype's empty availability sets.
const availability = {
  kristen: ["2026-08-13", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-27", "2026-08-28"],
  luis: ["2026-08-13", "2026-08-17", "2026-08-19", "2026-08-27", "2026-08-28"],
  che: ["2026-08-17", "2026-08-19", "2026-08-27"],
  laura: ["2026-08-13", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-27", "2026-08-28"],
};

async function main() {
  console.log("Inserting schools...");
  const schoolIdByName = {};
  for (const school of schools) {
    const { data, error } = await supabase.from("schools").insert(school).select().single();
    if (error) throw error;
    schoolIdByName[school.name] = data.id;
  }

  console.log("Inserting jobs + Picture Days...");
  const pictureDayIdByDate = {};
  for (const job of jobs) {
    const { data: jobRow, error: jobError } = await supabase
      .from("jobs")
      .insert({
        name: job.name,
        client: job.client,
        category: job.category,
        school_id: schoolIdByName[job.school] ?? null,
      })
      .select()
      .single();
    if (jobError) throw jobError;

    const { data: dayRows, error: daysError } = await supabase
      .from("picture_days")
      .insert(job.days.map((d) => ({ ...d, job_id: jobRow.id })))
      .select();
    if (daysError) throw daysError;

    dayRows.forEach((d) => {
      pictureDayIdByDate[d.date] = d.id;
    });
  }

  console.log("Inserting staff...");
  const staffIdByKey = {};
  for (const s of staff) {
    const { key, ...rest } = s;
    const { data, error } = await supabase.from("staff").insert(rest).select().single();
    if (error) throw error;
    staffIdByKey[key] = data.id;
  }

  console.log("Inserting availability...");
  const availabilityRows = [];
  for (const [key, dates] of Object.entries(availability)) {
    for (const date of dates) {
      availabilityRows.push({
        staff_id: staffIdByKey[key],
        picture_day_id: pictureDayIdByDate[date],
        available: true,
      });
    }
  }
  const { error: availError } = await supabase.from("availability").insert(availabilityRows);
  if (availError) throw availError;

  console.log("Done! Imported:");
  console.log(`  ${schools.length} schools`);
  console.log(`  ${jobs.length} jobs, ${Object.keys(pictureDayIdByDate).length} Picture Days`);
  console.log(`  ${staff.length} staff`);
  console.log(`  ${availabilityRows.length} availability responses`);
}

main().catch((err) => {
  console.error("Import failed:", err.message || err);
  process.exit(1);
});
