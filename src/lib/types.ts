// Qualification category — deliberately just two buckets. Anyone qualified
// for K-12 can shoot any K-something/TK/Pre-8 range, so finer school-type
// distinctions don't need to gate scheduling (see Job.school_type below for
// the actual grade range, kept for reference only).
export const CATEGORIES = ["Preschool", "K-12"] as const;
export type Category = (typeof CATEGORIES)[number];

// Specialty skills a job can require in addition to the school-type category:
// an outdoor-flagged day needs a photographer qualified in "Outdoor
// Photography"; a "+ group photo" day needs one qualified in "Group
// Photography"; a "babies"-flagged day needs one qualified in "Babies
// Photography". Staff can hold any mix of school-type and specialty
// qualifications.
export const SPECIALTIES = ["Outdoor Photography", "Group Photography", "Babies Photography"] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export const QUALIFICATIONS = [...CATEGORIES, ...SPECIALTIES] as const;
export type Qualification = (typeof QUALIFICATIONS)[number];

// Trainee is a supplemental 4th slot, checked on per Picture Day — unlike
// the other three, any active staff member is eligible (see roleCandidates
// in scheduling.ts), not just staff tagged with that role.
export const ROLES = ["Photographer", "Assistant", "Supervisor", "Trainee"] as const;
export type Role = (typeof ROLES)[number];

export const STUDIO_ADDRESS = "817 Arnold Dr, Martinez, CA 94553";
export const MILEAGE_RATE = 0.75;

// Deliberately minimal — Adi, 2026-09-19: "the only thing we add about a
// school in the scheduler is the address, for the purpose of schedule and
// payroll. but all the rest of the school details live in the timeline
// builder." staff_notes/reference_photos_url/setup_photos_url used to live
// here too; moved to Timeline Builder's tb_schools (location_notes/
// reference_photos_url/setup_photos_url there) so a school's details have
// one home instead of two. Read on /team via the existing cross-app
// staff_portal_briefing_for_days() function — see that function's own
// comment in supabase/schema.sql.
export type School = {
  id: string;
  name: string;
  address: string;
  round_trip_miles: number;
  address_unresolvable: boolean;
};

export type Job = {
  id: string;
  school_id: string | null;
  name: string;
  client: string;
  category: Category;
  // Actual grade range (TK-8, Pre-8, High School, etc.) — reference only,
  // never used for scheduling/qualification matching.
  school_type: string;
  // Number of students — reference only, entered manually per job.
  enrollment: number | null;
  // When true, Regenerate skips this job and its Schedule slots are
  // read-only until unlocked. Set automatically when a month is approved.
  locked: boolean;
};

export type PictureDay = {
  id: string;
  job_id: string;
  date: string; // YYYY-MM-DD
  setups: number;
  round_trip_miles: number;
  requires_supervisor: boolean;
  is_outdoor: boolean;
  has_group_photo: boolean;
  is_babies: boolean;
  has_trainee: boolean;
  // True when key info (e.g. setups) wasn't known yet at booking time and
  // still needs an owner to confirm it. Cleared automatically on edit.
  needs_review: boolean;
  // Manual nudges on top of the normal crew formula, for special cases.
  photographer_adjustment: number;
  assistant_adjustment: number;
  supervisor_adjustment: number;
};

export type JobWithDays = Job & { picture_days: PictureDay[] };

export type Staff = {
  id: string;
  name: string;
  roles: Role[];
  categories: Qualification[];
  priority: number;
  // Per-role override on top of the plain `priority` above — e.g. someone
  // who should be booked early as a Photographer but late as an Assistant.
  // Only set for roles an owner has explicitly overridden on the Staff
  // page; any role missing from this map falls back to `priority` (see
  // effectivePriority() in scheduling.ts).
  role_priority: Partial<Record<Role, number>>;
  distance_miles: number;
  location: string;
  phone: string;
  email: string;
  active: boolean;
  mileage_eligible: boolean;
  pin: string;
  // Stable, non-expiring per-staff secret in their subscribable calendar
  // feed URL (src/app/api/calendar/[token]/route.ts) — same "token in a
  // URL grants scoped access" shape as availability_links.token, but
  // permanent rather than expiring, since a calendar subscription has to
  // keep working indefinitely. Never shown on the owner-facing Staff page;
  // surfaced only to the staff member themselves on /team.
  calendar_token: string;
};

export type Availability = {
  staff_id: string;
  picture_day_id: string;
  available: boolean;
};

export type ScheduleAssignment = {
  id: string;
  picture_day_id: string;
  job_id: string;
  role: Role;
  slot_index: number;
  staff_id: string | null;
  equipment_case: string;
};

export type EquipmentCase = {
  case_number: number;
  active: boolean;
};

export type StaffSchoolDistance = {
  staff_id: string;
  school_id: string;
  distance_miles: number;
};
