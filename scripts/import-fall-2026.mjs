// One-time import of "Booked Schools List - 2026 Fall .csv" from Downloads.
//
// - Only imports rows from September 2026 onward — August is already
//   correctly represented (with per-division categories) from the original
//   prototype import, and this sheet lumps the whole school under one Type.
// - Rows with the same School name are grouped into a single Job with
//   multiple Picture Days (matching how Lodestar/Head-Royce were done).
// - Type -> category: "Preschool" stays Preschool, everything else (K-12,
//   TK-8, Pre-8, K-5, High School, etc.) becomes K-12 for qualification
//   purposes; the original Type is kept verbatim in school_type for reference.
// - Outoor/Outdoor -> is_outdoor; Group=1 -> has_group_photo.
// - Blank Setups -> defaults to 1 but flagged needs_review = true.
// - Round-trip miles are computed automatically via Distance Matrix
//   (studio -> school city) since the sheet has no mileage column.
//
// Run with: node scripts/import-fall-2026.mjs

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const CSV_PATH = "/Users/adinevo/Downloads/Booked Schools List - 2026 Fall .csv";
const STUDIO_ADDRESS = "817 Arnold Dr, Martinez, CA 94553";
const CUTOFF_DATE = "2026-09-01"; // skip everything before this (already imported)
const METERS_PER_MILE = 1609.344;

const envLocal = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
function envVar(name) {
  const match = envLocal.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

const SUPABASE_URL = envVar("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = envVar("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_MAPS_API_KEY = envVar("GOOGLE_MAPS_API_KEY");

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function parseCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function parseSheetDate(raw) {
  // e.g. "Thursday August 13, 2026" -> "2026-08-13". Requires an explicit
  // "Month Day, Year" shape — rejects anything else outright rather than
  // trusting the Date constructor's lenient (and surprising) fallback
  // parsing, which happily turns stray numbers like "$620" into a date.
  const match = raw.trim().match(/^(?:[A-Za-z]+\s+)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return null;
  const d = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function roundTripMilesTo(destination) {
  if (!GOOGLE_MAPS_API_KEY) return 0;
  const params = new URLSearchParams({
    origins: STUDIO_ADDRESS,
    destinations: destination,
    units: "imperial",
    key: GOOGLE_MAPS_API_KEY,
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
  const data = await res.json();
  const element = data.rows?.[0]?.elements?.[0];
  if (data.status !== "OK" || element?.status !== "OK") return 0;
  const oneWayMiles = element.distance.value / METERS_PER_MILE;
  return Math.round(oneWayMiles * 2);
}

async function main() {
  const lines = fs.readFileSync(CSV_PATH, "utf8").split("\n").slice(1); // drop header

  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const [, school, type, dateRaw, city, , setupsRaw, groupRaw, , outdoorRaw] = cells;
    if (!school?.trim() || !dateRaw?.trim()) continue;

    const date = parseSheetDate(dateRaw);
    if (!date || date < CUTOFF_DATE) continue;

    rows.push({
      school: school.trim(),
      type: type?.trim().replace(/\s+/g, " ") || "",
      city: city?.trim() || "",
      date,
      setups: setupsRaw?.trim() ? parseInt(setupsRaw, 10) : null,
      hasGroup: groupRaw?.trim() === "1",
      isOutdoor: /^out/i.test(outdoorRaw?.trim() || ""),
    });
  }

  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.school)) groups.set(row.school, []);
    groups.get(row.school).push(row);
  }

  console.log(`Found ${rows.length} Picture Days across ${groups.size} schools from ${CUTOFF_DATE} onward.`);

  let jobsCreated = 0;
  let daysCreated = 0;
  let daysNeedingReview = 0;
  const schoolsWithoutMiles = [];

  for (const [schoolName, days] of groups) {
    const { data: existingJob } = await supabase.from("jobs").select("id").eq("name", schoolName).maybeSingle();
    if (existingJob) {
      console.log(`Skipping "${schoolName}" — a job with this name already exists.`);
      continue;
    }

    const first = days[0];
    const category = first.type.toLowerCase() === "preschool" ? "Preschool" : "K-12";

    let schoolId = null;
    const { data: existingSchool } = await supabase
      .from("schools")
      .select("id")
      .ilike("name", schoolName)
      .maybeSingle();

    if (existingSchool) {
      schoolId = existingSchool.id;
    } else {
      const destination = `${first.city}, CA`;
      const miles = await roundTripMilesTo(destination);
      if (miles === 0) schoolsWithoutMiles.push(schoolName);

      const { data: newSchool, error: schoolError } = await supabase
        .from("schools")
        .insert({ name: schoolName, address: destination, round_trip_miles: miles })
        .select("id")
        .single();
      if (schoolError) throw schoolError;
      schoolId = newSchool.id;
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({ name: schoolName, client: schoolName, category, school_type: first.type, school_id: schoolId })
      .select("id")
      .single();
    if (jobError) throw jobError;
    jobsCreated++;

    const { data: school } = await supabase.from("schools").select("round_trip_miles").eq("id", schoolId).single();

    const { error: daysError } = await supabase.from("picture_days").insert(
      days.map((d) => ({
        job_id: job.id,
        date: d.date,
        setups: d.setups || 1,
        round_trip_miles: school?.round_trip_miles || 0,
        is_outdoor: d.isOutdoor,
        has_group_photo: d.hasGroup,
        needs_review: d.setups === null,
      }))
    );
    if (daysError) throw daysError;
    daysCreated += days.length;
    daysNeedingReview += days.filter((d) => d.setups === null).length;
  }

  console.log("\nDone!");
  console.log(`  ${jobsCreated} jobs created`);
  console.log(`  ${daysCreated} Picture Days created`);
  console.log(`  ${daysNeedingReview} flagged "needs review" (setups was blank in the sheet)`);
  if (schoolsWithoutMiles.length > 0) {
    console.log(`  Couldn't compute mileage for: ${schoolsWithoutMiles.join(", ")} — check/fix their address on the Jobs page.`);
  }
}

main().catch((err) => {
  console.error("Import failed:", err.message || err);
  process.exit(1);
});
