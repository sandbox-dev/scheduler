<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

This project uses Next.js 16 (App Router). Next 16 renamed `middleware.ts` to `src/proxy.ts` (exports a `proxy()` function instead of `middleware()`) — this is a real breaking change vs. older training data, not a mistake if you see it.

# Staffing logic — turning bookings into a schedule

Core files: `src/lib/scheduling.ts` (pure logic, no I/O) and `src/lib/types.ts` (the shapes it operates on). A "job" is one school's booking, which can span multiple `picture_days` (dates). Everything staffing-related keys off a single flattened `FlatJobDay` — one row per (job, date) — produced by `flattenJobDays()`.

## 1. Crew size formula (`crewFor()`)

- **Photographer** = `setups` (one photographer per setup) `+ 1` if `has_group_photo` (a dedicated group-photo shooter, on top of the normal setups).
- **Assistant** = `setups`, or `setups - 1` (never below 0) if `requires_supervisor` — a supervisor day trades one assistant slot for the supervisor slot, it doesn't add a new one.
- **Supervisor** = 1 if `requires_supervisor`, else 0.
- **Trainee** = 1 if `has_trainee`, else 0 — a genuinely supplemental slot, not part of the base formula.
- `photographer_adjustment` / `assistant_adjustment` / `supervisor_adjustment` are then added as a manual per-day delta on top of this formula (for special-case schools), clamped so a role can never go negative. There's no equivalent adjustment for Trainee — it's a plain boolean.

## 2. Which slot is "the group photo slot"

When `has_group_photo` is true, Photographer count is `setups + 1`, and the group slot is always the *last* Photographer index (`slotIndex === setups`) — `isGroupPhotoSlot()`. No separate flag is stored per-slot; the index alone tells you.

## 3. Qualifications required per slot (`requiredQualificationsFor()`)

Every slot always requires the job's own category (`"Preschool"` or `"K-12"` — see `CATEGORIES` in `types.ts`; a K-12-qualified photographer can shoot any of the school's actual finer-grained `school_type` values like "TK-8" or "Pre-8", since `school_type` is reference-only and never gates scheduling). On top of that:
- Any Photographer slot on an `is_outdoor` day also requires **"Outdoor Photography"**.
- The one group-photo slot (per §2) also requires **"Group Photography"**.

Staff hold qualifications as a flat `categories: Qualification[]` array (categories + specialties mixed together) — there's no separate schema-level distinction between "school-type qualified" and "specialty qualified".

## 4. Auto-generating a schedule (`generateSchedule()`)

Runs per job-day, filling roles in a fixed priority order: **Photographer → Supervisor → Assistant → Trainee**. Within Photographer, the group-photo slot (§2) is filled *first*, before the regular setup slots — it's the more constrained candidate pool (needs the Group Photography qualification too), so filling it first avoids accidentally using up a group-qualified specialist on a plain slot that any photographer could have covered.

Candidate ranking for a given role+slot (`candidatesFor`): must be marked available for that specific Picture Day (`availability` table, `available = true`), must hold every qualification `requiredQualificationsFor()` returns for that slot, and must not already be used elsewhere **that same date** (`usedPerDate` — this is a hard exclusion during generation, so the auto-generator itself never double-books someone across two different jobs on the same day). Survivors are sorted by seniority (highest first), then by distance to that specific school (nearest first) — `distanceFor()` uses a looked-up `staff_school_distances` row if one exists, else falls back to the staff member's general `distance_miles` from the studio.

**Trainee is the one role open to the entire staff list**, not staff tagged with that role (`roleCandidates()`) — trainees are usually existing Assistants training up, not a separately-tagged qualification. This is why Trainee fills last: it draws from a wider, less-constrained pool and shouldn't risk taking a candidate someone else's role actually needed.

## 5. Manual reassignment CAN double-book — it's flagged, not blocked

The exclusivity in §4 (`usedPerDate`) only applies during auto-generation. Manually reassigning a slot afterward (`swapAssignment()` in `src/app/(owner)/schedule/actions.ts`) has no same-date check at all — an owner can deliberately put the same staff member on two jobs the same day. The Schedule page computes this after the fact (`conflictWith` in `schedule/page.tsx`, keyed by `staffId_date` across every assignment) and shows a red **"Also on X (Role)"** warning on the slot (`ScheduleSlotCard.tsx`) — allowed on purpose (Adi wants to be able to do this while reworking a schedule), just surfaced so it's never silent.

## 6. Locking a job (`toggleJobLock`, `locked` on `jobs`)

A locked job's Schedule slots become read-only (`ScheduleSlotCard`'s `locked` prop disables the picker) and **Regenerate skips it entirely** — `generateAndSaveSchedule()` filters `!j.locked` before generating, so a locked job's `schedule_assignments` are never touched by a regenerate of the rest of the month. Approving a month (§7) auto-locks every job with a Picture Day in it; locking/unlocking itself never sends any email (that's a separate, explicit action from Approve).

## 7. Approving a month + emailing staff (`approveSchedule()`, `src/app/(owner)/schedule/actions.ts`)

Upserts a `schedule_approvals` row for the month, locks every job in it (§6), then — only if `ZAPIER_SCHEDULE_WEBHOOK_URL` is configured — POSTs one payload per staff member who has any assignment that month (name, email, a `days[]` array, and a pre-joined `summary` string) to Zapier, which sends the actual "Schedule Approved" email. **Silently skips anyone with no email on file** (collected in `skippedNoEmail`, shown back to the caller) — the Staff page needs a real email address per person for this to reach them. Safe to click again after edits; it just re-notifies everyone currently assigned, it doesn't fail on already-approved months (`upsert ... onConflict: "month"`).

## 8. Staff self-service availability — PIN-gated, submit-and-lock

Each staff member has a stable `pin` (4-digit) stored on their `staff` row. An owner generates one shared link per month (`createAvailabilityLink()` — a random token in `availability_links`, `LINK_LIFETIME_DAYS = 45`) and everyone uses the *same* link, entering their own name + PIN to unlock only their own data — `unlock_staff_availability(token, staff_id, pin)` (Postgres RPC, `supabase/schema.sql`) checks the PIN server-side before revealing anything, and rejects with `already_submitted` if that staff member already has an `availability_submissions` row for that month. Submitting (`submit_availability_final()`) re-checks token+PIN, **replaces the whole month's availability in one shot** (not a per-day toggle/merge), and writes to `availability_submissions` — which is what makes it a one-time lock; there's no user-facing "edit after submitting," only an owner can override from the Availability Tracker page (`setStaffAvailability()`, a direct owner-side upsert with no PIN or submitted-lock check, for when someone reports a change out of band by call/text).

There's an older, PIN-less pair of RPCs (`submit_availability`, `submit_availability_note`) still defined in `schema.sql` for reference, but their `anon`/`authenticated` execute grants were explicitly revoked once the PIN-gated versions shipped — **do not wire the UI back to those**, they're dead on purpose (the original bug this replaced: every staff member's existing answers were sent to the browser regardless of who was selected in a dropdown).

## 9. Pixifi → Zapier → this app (`src/app/api/webhooks/zapier/jobs/route.ts`)

Zapier catches a Pixifi workflow-phase-completion event and POSTs to this route (see the file's own header comment for the full expected JSON shape). Notable behavior, not just obvious plumbing:
- **Auth** is a shared secret header (`x-webhook-secret` must equal `ZAPIER_WEBHOOK_SECRET`), not Supabase auth — this endpoint has no logged-in user.
- **7-day merge window**: a booking for a school that already has a Job with a Picture Day within 7 days of the incoming date is treated as another day of that *same* booking round and merged in as an additional `picture_days` row; further out (e.g. a standalone makeup day) starts a brand-new Job — this is deliberate, not a dedup bug. Duplicate-webhook-retry protection is separate: if the exact same date already exists on the matched job, it's skipped as `"duplicate"` rather than inserted twice.
- **`setups` defaults to 1 and flags `needs_review: true`** if the payload didn't include a real setups count — Adi always confirms setups on the Jobs page afterward regardless, per the studio's normal workflow; this is intentionally never auto-guessed higher.
- **Indoor/outdoor auto-sets** from Pixifi's In/Out custom field (`indoor_outdoor`, matched case-insensitively for the substring "outdoor" — anything else, including blank, defaults to indoor).
- **Round-trip mileage** is auto-looked-up from `school_address` via the same Google Distance Matrix helper "Sync distances" uses (`lookupDistancesToDestination()`, doubled since that helper returns one-way miles) — falls back to a `round_trip_miles` value from the payload (default 0) if there's no address or the lookup throws, so a bad address never blocks a booking from coming in.
- **Known custom field IDs on Pixifi's "Picture Day" event type** (stable across events, useful if a Zap mapping ever needs re-checking): 19071 = Setups, 19072 = In/Out, 19073 = School Type, 19074 = Students (this last one isn't actually used by this route — `enrollment` is reference-only and the field was dropped from the Zap mapping on purpose).
- **Pixifi's Zapier custom triggers do not carry Event custom fields directly** — they have to be routed through that trigger's "Trigger Custom 1/2/3" slots in the Pixifi workflow's own settings (merge tags like `{cf:19071:setups}`), which is why the Zap's field mappings reference `Trigger Custom 1/2/3` rather than anything more directly named.
- **Each Pixifi workflow is its own distinct Zapier trigger instance**, even if named identically to another workflow feeding the same job type — reusing one Zap trigger across two workflows doesn't work; a second workflow needs its own duplicated Zap with the trigger step repointed at that workflow's specific trigger.

## 10. Equipment case assignment (`assignEquipmentCases()`)

4 physical cases (`EQUIPMENT_CASE_COUNT`), assigned per filled Photographer slot (regular or group) after generation. Prefers giving each photographer the *same* case for every job they shoot within a calendar week (`weeklyCaseByStaff`, keyed by ISO week via `weekOf()`/`groupByWeek()`) — only breaks that preference when two of their jobs land on the same date (a case can't be in two places at once) or when they haven't been assigned a case yet that week. If more than 4 photographers work the same date, whoever doesn't fit is left without a case on purpose — a real capacity problem to surface, not something to silently paper over with a 5th virtual case.

## 11. Mileage payroll (`mileageReport()`, `src/lib/googleDistance.ts`)

Built strictly from who was *actually assigned* to work a Picture Day (`schedule_assignments`), not who was merely available. One entry per (staff, date) even if they worked multiple roles/jobs that exact day (`seen` set dedupes by `staffId_date`) — `round_trip_miles` lives on the `picture_days` row itself (see §9 for how it's populated on import) and is summed per staff member across the date range, paid at the flat `MILEAGE_RATE` (`mileagePayFor()`).

## 12. What's still deferred / manual (check with Adi before assuming stale)

- **"Babies" qualifier** — a booking flag + matching staff qualification for infant/baby photography, mirroring how Outdoor/Group Photography already work (§3). Needed before September 2026 per Adi; not started as of this writing.
- **No invite/password-reset acceptance page** — creating a new staff login has to go through Supabase dashboard's "Create new user" (setting the password directly there and telling the person out of band), not "Send invitation" — the app has no route that handles a Supabase invite/recovery token yet.
- **Save-on-blur for Staff email/phone** — no explicit Save button; edits commit on blur. Adi wants an explicit Save at least for those two fields, to avoid accidental changes. Not started; scope (just those fields vs. app-wide) undecided.
- **Zapier email signatures** need fixing on the approval/availability-request emails — not urgent, exact issue not yet described.
- **Weekly printable header not updating between weeks** — reported once, not reproduced in testing. If this comes up again, get the exact navigation steps (new tab per Print click vs. prev/next within one tab) before assuming it's fixed or gone.
- **Staff roles have no permission tiers** — any Supabase Auth login is full owner access; accepted as fine for the one additional staff login (Steph) that exists today, but worth remembering if a future login should have been more limited.
