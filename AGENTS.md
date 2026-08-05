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
- Any Photographer slot on an `is_babies` day also requires **"Babies Photography"** (built 2026-08-03 — not every photographer is trained on infants; mirrors `is_outdoor` exactly, including that it doesn't change crew size, only who can fill the slot).
- The one group-photo slot (per §2) also requires **"Group Photography"**.

Staff hold qualifications as a flat `categories: Qualification[]` array (categories + specialties mixed together) — there's no separate schema-level distinction between "school-type qualified" and "specialty qualified".

## 4. Auto-generating a schedule (`generateSchedule()`)

Runs per job-day, filling roles in a fixed priority order: **Photographer → Supervisor → Assistant → Trainee**. Within Photographer, the group-photo slot (§2) is filled *first*, before the regular setup slots — it's the more constrained candidate pool (needs the Group Photography qualification too), so filling it first avoids accidentally using up a group-qualified specialist on a plain slot that any photographer could have covered.

Candidate ranking for a given role+slot (`candidatesFor`): must be marked available for that specific Picture Day (`availability` table, `available = true`), must hold every qualification `requiredQualificationsFor()` returns for that slot, and must not already be used elsewhere **that same date** (`usedPerDate` — this is a hard exclusion during generation, so the auto-generator itself never double-books someone across two different jobs on the same day). Survivors are sorted by priority (highest first — renamed from "seniority" 2026-08-03, since Adi and Julia are the most senior staff by actual tenure yet deliberately set themselves low here to be booked last; same field, same 1-5 scale, same sort direction, just a less confusing name), then by distance to that specific school (nearest first) — `distanceFor()` uses a looked-up `staff_school_distances` row if one exists, else falls back to the staff member's general `distance_miles` from the studio.

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

## 13. Inactive staff excluded from candidates (`roleCandidates()`, fixed 2026-08-04)

`roleCandidates()` — the single shared helper behind both the manual assignment dropdown (`schedule/page.tsx`) and `generateSchedule()`'s auto-fill — now filters to `staff.active` before anything else. Previously it wasn't filtered at all, so a staff member who'd quit (found via a real case: Che, inactive after quitting) still showed up as a selectable option in every Photographer/Assistant/Supervisor/Trainee dropdown and could still be auto-assigned by Regenerate. An already-assigned inactive staff member's existing assignment still displays fine (`staffId` is resolved separately via `staffById`, unaffected) — they just can't be picked for a *new* assignment going forward. No UI or data change needed elsewhere; this was a one-line fix at the single choke point both flows already shared.

**Same bug, second occurrence (fixed 2026-08-05):** the owner-facing Availability response tracker (`availability-tracker/page.tsx`) called `getStaff()` directly with no active filter at all, independently of `roleCandidates()` — also found via Che still showing up, this time under next month's tracker. Fixed the same way (`.filter(s => s.active)` right after the fetch). At the time of that fix, every *other* staff-list call site was checked and already filtered correctly: the "Send availability request" action (`if (!s.active) continue`), and the public availability form's own `get_availability_form_data` RPC (`where s.active` in `schema.sql`). If a staff-list bug like this turns up a third time, check every remaining raw `getStaff()` call site, not just the one reported — there's no single shared chokepoint for *this* particular flow the way `roleCandidates()` is for scheduling.

## 14. Saved Schools — search, inline editing, delete (built 2026-08-04/05)

The Jobs page's "Saved schools" panel (`SchoolsPanel.tsx`, extracted from `page.tsx` into its own client component to hold filter state) now has:
- A **search-by-name box**, since the list runs 50+ entries and was an unmanageable scroll.
- **The school name itself is editable** (`updateSchoolField` gained `"name"` as an allowed field) — previously only address/round-trip-miles were.
- A **Remove button** per row (`deleteSchool` action). Safe any time: `jobs.school_id` is `on delete set null`, and a Picture Day's own `round_trip_miles` is copied at creation time onto the `picture_days` row itself, not looked up live — so deleting a saved school never changes an existing job's own saved data, it only clears that job's "saved school" shortcut link (which matters solely if a `staff_school_distances`-based Regenerate happens later; low-stakes, fixed by re-running Sync Distances).
- All three fields (name, address, miles) switched from save-on-blur to the same explicit-Save-button pattern as Staff email/phone (Adi: accidental-edit risk) — `SavableField` (`src/components/SavableField.tsx`) is now a shared, generalized component reused by both Staff and Schools, deliberately in its own file rather than added to `components/ui.tsx`, since that file is imported by several true Server Component pages and adding a hook-using export there would force the whole module client-side.
- Fields render as **plain text at rest** (`.field-input-ghost` in `globals.css` — transparent border/background, only shows the frame on focus) instead of looking permanently "in edit mode."
- **Name and Address are 2-row wrapping textareas**, not single-line inputs — verified against all real saved schools (not just a short test value) that nothing clips: a single-line 170px name field was silently truncating ~16 of 56 real school names with no visual indicator. When resizing one table column, the browser's `table-layout: auto` can redistribute width to *other* columns unpredictably — re-verify every column after touching any one of them, not just the one changed.
- Delete button is icon-only (no "Remove" label) — Adi: "we want a clean sleek app, too many words is just clutter," said while this same row was already being trimmed for space.

## 15. Pixifi make-up day bookings no longer create duplicate saved schools (fixed 2026-08-05)

The webhook's schools lookup (§9) matched by exact name (`ilike` with no wildcards is case-insensitive equality, not fuzzy) — Pixifi sends a make-up day's `school_name` with a trailing "Makeup Day"/"Make Up Day"/"Make-Up Day" (inconsistent spacing/hyphenation across schools), which never matched the school's real saved entry and silently created a fresh duplicate row on *every single make-up day booking, for every school* — not a one-off manual-entry habit, a real recurring bug (confirmed: ~16 duplicate "X Makeup Day" schools already existed in production before this fix). Now strips that trailing suffix (`/\s+make[\s-]?up\s+day$/i`) before the lookup/insert, so it resolves to the school's one real row. Only affects which `schools` row gets matched — the Job's own name/client (what actually shows on the Jobs page, e.g. "Head-Royce School Makeup Day") is untouched. Pre-existing duplicates from before this fix aren't auto-merged; Adi cleans those up by hand with the §14 delete button as she gets to them.

## 16. Choose specific recipients for an availability request (built 2026-08-05)

`sendAvailabilityRequests()` (`availability-tracker/actions.ts`) took an optional `staffIds?: string[]` on top of its existing `(month, linkUrl, deadlineAt)` — omitted, behavior is unchanged (send to everyone active). `SendAvailabilityButton.tsx` defaults to an "Everyone" scope (all active staff pre-selected) with a "Choose who" toggle that reveals per-person chips to narrow it down. Built for two real scenarios Adi described: a staff member added mid-month (no need to re-notify everyone who's already submitted and locked their answers), and re-flagging a last-minute new Picture Day to specific people rather than resending to the whole roster.

The shared deadline reset (`reminder_sent_at`/`deadline_notice_sent_at` cleared to null on every send) still applies to the *whole* link regardless of `staffIds` — the deadline itself isn't per-person, so a changed deadline re-arms the reminder/missed-deadline checks for everyone on the link, not just whoever this particular send targeted. No per-person deadlines exist; if that's ever wanted, it's a bigger change than this.

Also added: a `title` tooltip on the Send button itself, since this is only used once a month and Adi wanted a reminder of what it actually does without having to re-derive it each time.

**Confirm dialog + success/warning banner added same day, after a real incident:** the button originally sent on a single click with no confirmation — Adi accidentally sent live availability-request emails while testing it and asked "can we unsend???" (answer: no, once Gmail delivers it there's no recall from this app; only Gmail's own personal Undo-Send window, seconds long, could have, and by the time anyone notices it's already passed). `handleSend()` now always shows a `confirm()` dialog first, spelling out exactly who (`targetNames`, e.g. "all 7 active staff" or the specific names chosen) and the deadline in a human-readable format — every send, no exceptions, matching the same pattern already used for Remove Job/Remove School.

The result banner is also now typed (`{ kind: "sent" | "not-configured", text }` instead of a bare string) so a real send renders green/success (`CheckCircle2`) but "no webhook configured, nothing was sent" renders amber/warning (`AlertTriangle`, same `--gold-tint`/`--gold` as the Jobs/Staff "needs attention" banners) — these used to share one plain-string `message` state and render identically, which meant a configuration warning could look exactly like a successful send. This is the same class of issue the "visible confirmation" rule already covers elsewhere in this app (a side-effect action needs an obvious, honest banner) — worth checking any other send-and-report action in this app for the same silent-blend-of-success-and-warning risk if one comes up.

## 17. Availability send log — who sent what, when (built 2026-08-05)

New table `availability_send_log` (month, sent_at, sent_by, recipient_names[]) — one row per successful "Send availability request" click, appended by `sendAvailabilityRequests()` right after the webhook loop, only when `webhookConfigured` (a no-op "nothing sent" outcome never logs). `sent_by` is the calling owner's own email via `supabase.auth.getUser()` — the first time this app records *who* (not just *that*) an action happened, since Adi, Julia, and Steph all share equal full-owner access with no other way to tell each other apart. Adi's stated reason: "if I send it, and Steph goes to send, she'll see I already did it."

Deliberately an append-only log, not a single "last sent" field on `availability_links` — a follow-up send to a few specific people (the §16 recipient picker) stays visible as its own row alongside the original send-to-everyone, rather than overwriting it. Rendered on the availability-tracker page directly above the Send button (most recent first, via `getAvailabilitySendLog()` in `lib/data.ts`), so it's the natural thing to notice before clicking Send again, not something that has to be sought out. Long recipient lists truncate to the first 3 + "+N more" rather than printing every name every time — matches the app's general "clean, minimal" bias, and the full list is only really needed for the exceptional narrow-recipient case, which is short by definition.

Scoped to owner-initiated sends only — the automated reminder/deadline-missed cron emails aren't logged here, since those aren't at risk of two humans accidentally duplicating each other's click.

## 18. Confirm before a manual availability override (`AvailabilityChips.tsx`, built 2026-08-05)

The response tracker's per-date chips (an owner directly overriding what a staff member submitted, or hasn't yet — `setStaffAvailability`) used to toggle instantly on click, no confirmation. Adi: a manual override is a real scheduling-affecting change, easy to fire by an accidental click while scanning the tracker, and asked for the same "are you sure" treatment as any other real-effect action in this app. `toggle()` now shows `confirm("Mark {name} as {available/NOT available} for {date}?")` before touching state or calling the action; declining leaves everything untouched. Only wired into the owner-facing tracker (`AvailabilityChips.tsx`) — the staff-facing public form (`AvailabilityForm.tsx`, a completely separate component) is unaffected, since a staff member submitting their own answers isn't the same "did I mean to click that" risk an owner scanning a table of everyone's data is.

## 19. What's still deferred / manual (check with Adi before assuming stale)

- **No invite/password-reset acceptance page** — creating a new staff login has to go through Supabase dashboard's "Create new user" (setting the password directly there and telling the person out of band), not "Send invitation" — the app has no route that handles a Supabase invite/recovery token yet.
- **Staff roles have no permission tiers** — any Supabase Auth login is full owner access; accepted as fine for the one additional staff login (Steph) that exists today, but worth remembering if a future login should have been more limited.
- **Pixifi ↔ Scheduler reconciliation** — paused mid-design, not built. Goal: a periodic check (Adi wants it timed around the 1st of each month, ahead of the first-Friday availability request) that fetches Pixifi's direct ICS feed (`https://www.pixifi.com/gcal/{token}/` — confirmed this is a real, direct calendar feed straight from Pixifi, not routed through Google Calendar; no OAuth/service-account needed, just an HTTP fetch) and cross-references it against Scheduler's own upcoming Jobs/Picture Days by date + fuzzy school-name match. Flags mismatches both directions (Scheduler-only → possibly canceled in Pixifi; Pixifi-only → booked but missing from Scheduler, confirmed against real data to be a real, live gap) via email — never auto-adds or auto-deletes. Needs one more Zap (Catch Hook → Gmail send) before the code can be finished; the ICS feed URL itself needs to be stored as a secret env var once picked back up.
- **Adi's stated future interest, not started**: eventually building a custom CRM to replace Pixifi entirely (contracts, invoicing, e-signatures, lead intake, calendar/email sync beyond just booking). If picked up, recommended approach is to absorb specific pain-point modules into this app incrementally rather than a full rebuild, keeping Pixifi/a payments processor for the hard-to-replicate parts (payments, e-signature/compliance).
