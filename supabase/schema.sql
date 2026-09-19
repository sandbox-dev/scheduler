-- Picture Day Scheduler — database schema
-- Run this once in the Supabase project's SQL Editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: uses "if not exists" / "or replace" everywhere.

create extension if not exists pgcrypto;

-- ---------- Core tables ----------

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  round_trip_miles numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Set true when "Sync distances" tried this school's address and Google
-- couldn't find directions to it (typo, missing city/state, etc). Distinct
-- from an empty address — this is a bad address, not a missing one.
alter table schools add column if not exists address_unresolvable boolean not null default false;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) on delete set null,
  name text not null,
  client text not null default '',
  category text not null check (category in ('Preschool', 'K-8', 'K-12', 'Elementary', 'Makeup Day')),
  created_at timestamptz not null default now()
);

-- Qualification categories were narrowed to just Preschool/K-12 — anyone
-- qualified for K-12 can shoot any K-something/TK/Pre-8 range, so finer
-- school-type distinctions don't need to gate scheduling. The actual grade
-- range (TK-8, Pre-8, High School, etc.) is kept separately, for reference
-- only, in school_type.
update jobs set category = 'K-12' where category in ('K-8', 'Elementary', 'Makeup Day');
alter table jobs drop constraint if exists jobs_category_check;
alter table jobs add constraint jobs_category_check check (category in ('Preschool', 'K-12'));
alter table jobs add column if not exists school_type text not null default '';

-- Enrollment (number of students) — tracked per job, for reference only.
alter table jobs add column if not exists enrollment integer;

-- Same narrowing applied to every staff member's qualifications, so no one
-- loses a qualification they already had (K-8/Elementary/Makeup Day
-- qualifications become K-12; duplicates are collapsed).
update staff set categories = (
  select array_agg(distinct mapped)
  from (
    select case when c in ('K-8', 'Elementary', 'Makeup Day') then 'K-12' else c end as mapped
    from unnest(categories) as c
  ) sub
)
where categories && array['K-8', 'Elementary', 'Makeup Day'];

create table if not exists picture_days (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  date date not null,
  setups integer not null default 1 check (setups >= 1),
  round_trip_miles numeric not null default 0,
  requires_supervisor boolean not null default false,
  created_at timestamptz not null default now(),
  unique (job_id, date)
);

-- Outdoor shoots need a photographer qualified in "Outdoor Photography";
-- a group photo adds one extra photographer slot (qualified in "Group
-- Photography") without adding an extra assistant.
alter table picture_days add column if not exists is_outdoor boolean not null default false;
alter table picture_days add column if not exists has_group_photo boolean not null default false;

-- Babies shoots need a photographer qualified in "Babies Photography" —
-- not every photographer is trained on infants. Mirrors is_outdoor: every
-- Photographer slot on a flagged day requires the qualification, no change
-- to crew size.
alter table picture_days add column if not exists is_babies boolean not null default false;

-- Manual nudges on top of the normal crew formula, for special cases (e.g. a
-- school that always wants one extra assistant). Applied as a delta, not a
-- replacement, so the underlying rule stays visible. Clamped at 0 minimum.
alter table picture_days add column if not exists photographer_adjustment integer not null default 0;
alter table picture_days add column if not exists assistant_adjustment integer not null default 0;
alter table picture_days add column if not exists supervisor_adjustment integer not null default 0;

-- True when key info (e.g. setups) wasn't known yet at booking time — lets
-- the Jobs page flag Picture Days that still need an owner's eyes on them.
alter table picture_days add column if not exists needs_review boolean not null default false;

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  roles text[] not null default '{}',
  categories text[] not null default '{}',
  seniority integer not null default 1 check (seniority between 1 and 5),
  distance_miles numeric not null default 0,
  location text not null default '',
  phone text not null default '',
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Whether this person gets mileage reimbursement through Payroll — false for
-- owners who work Picture Days but aren't paid mileage (toggle from the
-- Staff page).
alter table staff add column if not exists mileage_eligible boolean not null default true;

-- One-time rename: "seniority" read as tenure/experience, but the field is
-- really booking priority (higher = booked first) — Adi and Julia are the
-- most senior staff by actual tenure, yet deliberately set themselves low
-- here since they want to be booked LAST, which made the old name
-- confusing. No behavior change, same 1-5 scale, same sort direction.
-- Guarded so re-running this script after the first time is a no-op.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'staff' and column_name = 'seniority'
  ) then
    alter table staff rename column seniority to priority;
  end if;
end $$;

create table if not exists availability (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  picture_day_id uuid not null references picture_days(id) on delete cascade,
  available boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (staff_id, picture_day_id)
);

create table if not exists schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  picture_day_id uuid not null references picture_days(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  role text not null check (role in ('Photographer', 'Assistant', 'Supervisor')),
  slot_index integer not null check (slot_index >= 0),
  staff_id uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (picture_day_id, role, slot_index)
);

-- Which equipment case a Photographer is taking out — tracked per assignment
-- since a multi-setup day needs one case per photographer, not one for the
-- whole day. Only meaningful for the Photographer role.
alter table schedule_assignments add column if not exists equipment_case text not null default '';

-- One-time migration from the old per-day equipment_case field (replaced by
-- the per-photographer field above): carries any existing value forward onto
-- that day's Photographer assignments, then drops the old column. Guarded so
-- re-running this script after the first time is a no-op.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'picture_days' and column_name = 'equipment_case'
  ) then
    update schedule_assignments sa
    set equipment_case = pd.equipment_case
    from picture_days pd
    where sa.picture_day_id = pd.id
      and sa.role = 'Photographer'
      and pd.equipment_case <> ''
      and sa.equipment_case = '';

    alter table picture_days drop column equipment_case;
  end if;
end $$;

-- The studio's physical equipment cases as real rows, not just the bare
-- EQUIPMENT_CASE_COUNT literal in scheduling.ts. Adi, 2026-09-01: "our case
-- one is out of commission, and the app has it assigned incorrectly" — same
-- shape as the staff.active gap (§13, AGENTS.md): assignEquipmentCases() and
-- the manual case dropdown both need to skip a case that's out of commission,
-- same as roleCandidates() already skips inactive staff. Seeded with the 4
-- cases the studio has today; add a row here (not a code change) if a 5th is
-- ever bought.
create table if not exists equipment_cases (
  case_number integer primary key,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into equipment_cases (case_number)
select generate_series(1, 4)
on conflict (case_number) do nothing;

-- Cached staff-to-school distances (Distance Matrix API), used to rank
-- schedule candidates by proximity to the actual job, not the studio.
-- Computed once per staff+school pair and reused for every future booking
-- at that school — see the "Sync distances" action on the Staff page.
create table if not exists staff_school_distances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  distance_miles numeric not null,
  computed_at timestamptz not null default now(),
  unique (staff_id, school_id)
);

-- Monthly public link staff use to submit availability without an account.
create table if not exists availability_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  month date not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Free-text note a staff member can leave when submitting availability for a
-- month (scheduling preference, a hard-out time, etc). Purely informational —
-- never read by the scheduling algorithm.
create table if not exists availability_notes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  month date not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (staff_id, month)
);

-- Marks a month's schedule as approved/final. Approving triggers one email
-- notification per staff member (via a Zapier webhook) with their confirmed
-- dates — see the "Approve schedule" action on the Schedule page.
create table if not exists schedule_approvals (
  month date primary key,
  approved_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
-- Owners (Adi & Julia) authenticate via Supabase Auth and get full read/write
-- access to everything. Staff never log in — they reach a single public link
-- (gated by availability_links.token) and can only read/write through the
-- security-definer RPCs below, never directly against these tables.

alter table schools enable row level security;
alter table jobs enable row level security;
alter table picture_days enable row level security;
alter table staff enable row level security;
alter table availability enable row level security;
alter table schedule_assignments enable row level security;
alter table availability_links enable row level security;
alter table staff_school_distances enable row level security;
alter table availability_notes enable row level security;
alter table schedule_approvals enable row level security;
alter table equipment_cases enable row level security;

drop policy if exists "owners full access" on schools;
create policy "owners full access" on schools for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on jobs;
create policy "owners full access" on jobs for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on picture_days;
create policy "owners full access" on picture_days for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on staff;
create policy "owners full access" on staff for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on availability;
create policy "owners full access" on availability for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on schedule_assignments;
create policy "owners full access" on schedule_assignments for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on availability_links;
create policy "owners full access" on availability_links for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on staff_school_distances;
create policy "owners full access" on staff_school_distances for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on availability_notes;
create policy "owners full access" on availability_notes for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on schedule_approvals;
create policy "owners full access" on schedule_approvals for all to authenticated using (true) with check (true);

drop policy if exists "owners full access" on equipment_cases;
create policy "owners full access" on equipment_cases for all to authenticated using (true) with check (true);

-- No policies granted to `anon` — the public availability page reaches data
-- exclusively through the SECURITY DEFINER functions below.

-- ---------- Public RPCs for the staff availability page ----------

-- Returns the roster + this month's open Picture Days for a valid, unexpired link.
create or replace function get_availability_form_data(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link availability_links%rowtype;
  v_result json;
begin
  select * into v_link from availability_links where token = p_token and expires_at > now();
  if not found then
    return json_build_object('error', 'invalid_or_expired_link');
  end if;

  select json_build_object(
    'month', v_link.month,
    'staff', (
      select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::json)
      from staff s where s.active
    ),
    'picture_days', (
      select coalesce(json_agg(json_build_object(
        'id', pd.id,
        'date', pd.date,
        'job_name', j.name,
        'category', j.category
      ) order by pd.date), '[]'::json)
      from picture_days pd
      join jobs j on j.id = pd.job_id
      where date_trunc('month', pd.date) = date_trunc('month', v_link.month)
    ),
    'existing', (
      select coalesce(json_agg(json_build_object(
        'staff_id', a.staff_id,
        'picture_day_id', a.picture_day_id,
        'available', a.available
      )), '[]'::json)
      from availability a
      join picture_days pd on pd.id = a.picture_day_id
      where date_trunc('month', pd.date) = date_trunc('month', v_link.month)
    ),
    'notes', (
      select coalesce(json_agg(json_build_object('staff_id', n.staff_id, 'note', n.note)), '[]'::json)
      from availability_notes n
      where date_trunc('month', n.month) = date_trunc('month', v_link.month)
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function get_availability_form_data(text) to anon, authenticated;

-- Upserts one staff member's availability for one Picture Day, gated by a valid link token.
create or replace function submit_availability(
  p_token text,
  p_staff_id uuid,
  p_picture_day_id uuid,
  p_available boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valid boolean;
begin
  select exists(
    select 1 from availability_links where token = p_token and expires_at > now()
  ) into v_valid;

  if not v_valid then
    raise exception 'invalid_or_expired_link';
  end if;

  insert into availability (staff_id, picture_day_id, available, updated_at)
  values (p_staff_id, p_picture_day_id, p_available, now())
  on conflict (staff_id, picture_day_id)
  do update set available = excluded.available, updated_at = now();
end;
$$;

grant execute on function submit_availability(text, uuid, uuid, boolean) to anon, authenticated;

-- Upserts one staff member's note for a month, gated by a valid link token.
create or replace function submit_availability_note(
  p_token text,
  p_staff_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link availability_links%rowtype;
begin
  select * into v_link from availability_links where token = p_token and expires_at > now();
  if not found then
    raise exception 'invalid_or_expired_link';
  end if;

  insert into availability_notes (staff_id, month, note, updated_at)
  values (p_staff_id, v_link.month, p_note, now())
  on conflict (staff_id, month)
  do update set note = excluded.note, updated_at = now();
end;
$$;

grant execute on function submit_availability_note(text, uuid, text) to anon, authenticated;

-- Per-job lock: when true, Regenerate skips this job entirely (its
-- schedule_assignments are left untouched) and its Schedule slots become
-- read-only until unlocked. Approving a month locks every job in it
-- automatically; locking/unlocking itself never triggers staff emails.
alter table jobs add column if not exists locked boolean not null default false;

-- Trainee slot: one extra role slot per Picture Day, checked on manually.
-- Unlike Photographer/Assistant/Supervisor, any active staff member is
-- eligible — trainees are usually existing Assistants training up to
-- Photographer, not a separately-tagged qualification.
alter table picture_days add column if not exists has_trainee boolean not null default false;
alter table schedule_assignments drop constraint if exists schedule_assignments_role_check;
alter table schedule_assignments add constraint schedule_assignments_role_check
  check (role in ('Photographer', 'Assistant', 'Supervisor', 'Trainee'));

-- ---------- Availability link: per-staff PIN + submit-and-lock ----------

-- Random 4-digit PIN, auto-assigned to every staff member (existing rows
-- too — the random() default backfills each one independently). Shown on
-- the Staff page for reference; emailed to each person automatically when
-- the owner sends an availability request.
alter table staff add column if not exists pin text not null default lpad(floor(random() * 10000)::text, 4, '0');

-- Marks a staff member's availability for a month as submitted-and-locked
-- via the public link, so they can't go back and change it themselves
-- (the owner can still override manually from the Availability Tracker).
create table if not exists availability_submissions (
  staff_id uuid not null references staff(id) on delete cascade,
  month date not null,
  submitted_at timestamptz not null default now(),
  primary key (staff_id, month)
);
alter table availability_submissions enable row level security;
drop policy if exists "owners full access" on availability_submissions;
create policy "owners full access" on availability_submissions for all to authenticated using (true) with check (true);

-- get_availability_form_data used to return EVERY staff member's existing
-- availability + notes up front, relying on the client to only display the
-- selected person's — meaning anyone with the link could see (and, via the
-- old submit_availability RPC, edit) everyone else's data. Narrowed to just
-- the roster (names) and the month's Picture Days; a given person's own
-- existing answers are now only returned after they prove their PIN, via
-- unlock_staff_availability below.
create or replace function get_availability_form_data(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link availability_links%rowtype;
  v_result json;
begin
  select * into v_link from availability_links where token = p_token and expires_at > now();
  if not found then
    return json_build_object('error', 'invalid_or_expired_link');
  end if;

  select json_build_object(
    'month', v_link.month,
    'staff', (
      select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::json)
      from staff s where s.active
    ),
    'picture_days', (
      select coalesce(json_agg(json_build_object(
        'id', pd.id,
        'date', pd.date,
        'job_name', j.name,
        'category', j.category
      ) order by pd.date), '[]'::json)
      from picture_days pd
      join jobs j on j.id = pd.job_id
      where date_trunc('month', pd.date) = date_trunc('month', v_link.month)
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Verifies a staff member's PIN and, if correct, returns just their own
-- existing selections + note for the month — or an error if the PIN is
-- wrong or they've already submitted (locked).
create or replace function unlock_staff_availability(p_token text, p_staff_id uuid, p_pin text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link availability_links%rowtype;
  v_staff_pin text;
  v_result json;
begin
  select * into v_link from availability_links where token = p_token and expires_at > now();
  if not found then
    return json_build_object('error', 'invalid_or_expired_link');
  end if;

  select pin into v_staff_pin from staff where id = p_staff_id and active;
  if not found or v_staff_pin is distinct from p_pin then
    return json_build_object('error', 'invalid_pin');
  end if;

  if exists (
    select 1 from availability_submissions
    where staff_id = p_staff_id and date_trunc('month', month) = date_trunc('month', v_link.month)
  ) then
    return json_build_object('error', 'already_submitted');
  end if;

  select json_build_object(
    'existing', (
      select coalesce(json_agg(a.picture_day_id), '[]'::json)
      from availability a
      join picture_days pd on pd.id = a.picture_day_id
      where a.staff_id = p_staff_id and a.available
        and date_trunc('month', pd.date) = date_trunc('month', v_link.month)
    ),
    'note', (
      select coalesce(n.note, '') from availability_notes n
      where n.staff_id = p_staff_id and date_trunc('month', n.month) = date_trunc('month', v_link.month)
    )
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function unlock_staff_availability(text, uuid, text) to anon, authenticated;

-- Re-validates token + PIN + not-already-submitted, then replaces this
-- staff member's availability for the month in one shot (full-replace, not
-- a per-day toggle) and locks it via availability_submissions.
create or replace function submit_availability_final(
  p_token text,
  p_staff_id uuid,
  p_pin text,
  p_available_day_ids uuid[],
  p_note text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link availability_links%rowtype;
  v_staff_pin text;
  v_staff_name text;
  v_active_count integer;
  v_submitted_count integer;
begin
  select * into v_link from availability_links where token = p_token and expires_at > now();
  if not found then
    return json_build_object('error', 'invalid_or_expired_link');
  end if;

  select pin, name into v_staff_pin, v_staff_name from staff where id = p_staff_id and active;
  if not found or v_staff_pin is distinct from p_pin then
    return json_build_object('error', 'invalid_pin');
  end if;

  if exists (
    select 1 from availability_submissions
    where staff_id = p_staff_id and date_trunc('month', month) = date_trunc('month', v_link.month)
  ) then
    return json_build_object('error', 'already_submitted');
  end if;

  delete from availability a
  using picture_days pd
  where a.picture_day_id = pd.id
    and a.staff_id = p_staff_id
    and date_trunc('month', pd.date) = date_trunc('month', v_link.month);

  insert into availability (staff_id, picture_day_id, available, updated_at)
  select p_staff_id, day_id, true, now()
  from unnest(p_available_day_ids) as day_id;

  insert into availability_notes (staff_id, month, note, updated_at)
  values (p_staff_id, v_link.month, coalesce(p_note, ''), now())
  on conflict (staff_id, month) do update set note = excluded.note, updated_at = now();

  insert into availability_submissions (staff_id, month, submitted_at)
  values (p_staff_id, v_link.month, now())
  on conflict (staff_id, month) do nothing;

  -- Lets the caller fire "everyone's in" owner notification without a
  -- second round trip. Safe to compute unconditionally here — since a
  -- submission can never be undone, this can only flip to true once per
  -- month, on whichever submission happens to be the last one in.
  select count(*) into v_active_count from staff where active;
  select count(*) into v_submitted_count
    from availability_submissions asub
    join staff s on s.id = asub.staff_id and s.active
    where date_trunc('month', asub.month) = date_trunc('month', v_link.month);

  return json_build_object(
    'ok', true,
    'staff_name', v_staff_name,
    'month', v_link.month,
    'all_submitted', v_active_count > 0 and v_submitted_count >= v_active_count
  );
end;
$$;
grant execute on function submit_availability_final(text, uuid, text, uuid[], text) to anon, authenticated;

-- Superseded by unlock_staff_availability / submit_availability_final,
-- which check a PIN before revealing or changing anything. Revoke public
-- access so the old no-PIN path can't be used to read or edit someone
-- else's availability.
revoke execute on function submit_availability(text, uuid, uuid, boolean) from anon, authenticated;
revoke execute on function submit_availability_note(text, uuid, text) from anon, authenticated;

-- ---------- Owner notifications + 24h-before-deadline reminder ----------

-- "Respond by" deadline for a month's availability window, set by the owner
-- when sending the request (see sendAvailabilityRequests). Drives the 24h-
-- before reminder cron job (src/app/api/cron/availability-reminders).
alter table availability_links add column if not exists deadline_at timestamptz;

-- Set once the 24h-before-deadline reminder batch has fired for this link,
-- so the hourly cron job never re-sends it. Cleared back to null if the
-- owner re-sends the request with a new deadline.
alter table availability_links add column if not exists reminder_sent_at timestamptz;

-- Set once the deadline itself has passed and the cron job has checked
-- whether anyone's still missing (and notified the studio if so). Cleared
-- back to null alongside reminder_sent_at on a re-send with a new deadline.
alter table availability_links add column if not exists deadline_notice_sent_at timestamptz;

-- Who this link's CURRENT deadline cycle actually applies to — null means
-- "everyone active" (a normal send-to-everyone request), a real array means
-- the most recent send narrowed to specific people (see sendAvailabilityRequests'
-- staffIds param). Fixes a real incident (2026-08-14): two new trainees were
-- sent their own narrow availability request; the whole rest of the staff
-- list (already submitted weeks earlier under the original request, never
-- sent this one) got the 24h reminder anyway, because the reminder cron had
-- no way to know "pending" should mean "was asked and hasn't answered," not
-- just "active and has no submission row for this month." Set on every send
-- alongside the deadline reset above. Accumulates across sends rather than
-- being replaced (see mergeAskedStaffIds in src/lib/availability.ts): this
-- is "everyone who has been asked this month," not "who the most recent send
-- went to." Replacing it meant a follow-up send to one late-added person
-- silently removed everyone else still outstanding from both the reminder
-- and the deadline-missed notice. Widening is always safe — anyone who has
-- actually submitted is filtered out by getPendingStaff regardless.
alter table availability_links add column if not exists staff_ids uuid[];

-- One row per "Send availability request" click — lets one owner see that
-- another already sent this month's request before sending it again (e.g.
-- Adi and Steph both have full owner logins with no other way to tell).
-- Intentionally a plain append-only log, not just a "last sent" field on
-- availability_links, so a follow-up send to a few specific people (a
-- late-added staff member, a last-minute new date) stays visible alongside
-- the original send-to-everyone rather than overwriting it.
create table if not exists availability_send_log (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  sent_at timestamptz not null default now(),
  sent_by text not null default '',
  recipient_names text[] not null default '{}'
);
alter table availability_send_log enable row level security;
drop policy if exists "owners full access" on availability_send_log;
create policy "owners full access" on availability_send_log for all to authenticated using (true) with check (true);

-- Per-role priority override, on top of the plain `priority` column — e.g.
-- someone who should be booked early as a Photographer but later as an
-- Assistant. Keyed by role name (e.g. {"Assistant": 2}); any role missing
-- from the map falls back to the plain `priority` field (see
-- effectivePriority() in src/lib/scheduling.ts). Empty by default so every
-- existing staff member keeps behaving exactly as before until an owner
-- explicitly sets an override.
alter table staff add column if not exists role_priority jsonb not null default '{}'::jsonb;

-- A Google Drive link to the school's existing shared setup/reference
-- photos folder — nullable, shown on both the owner Jobs page
-- (ReferencePhotosInput) and the mobile staff view below. Only an owner can
-- ever write it (see the staff-scoped write-blocking policies below); no
-- staff-facing edit UI exists.
alter table jobs add column if not exists reference_photos_url text;

-- ---------- Staff portal: staff-scoped logins (read-only) ----------
-- Everything above this point assumed "authenticated" means "an owner"
-- (Adi/Julia) — true up to now, since the app never issued any other kind
-- of login. This section adds a SECOND kind of authenticated account: a
-- staff-scoped login (one per staff member using the mobile staff view)
-- that must only ever see their OWN schedule, never anyone else's data, and
-- can never write anything.
--
-- Rather than rewrite the "owners full access" policies above, this layers
-- RESTRICTIVE policies on top of them. Postgres ANDs a restrictive policy
-- against whatever permissive policy already granted access — so these can
-- only ever narrow what an account can do, never widen it. An owner login
-- (any authenticated user with no matching staff.auth_user_id row) sails
-- through every one of them unaffected, since each restrictive check below
-- starts with "not is_staff_account() or ...".

alter table staff add column if not exists auth_user_id uuid references auth.users(id);
alter table staff drop constraint if exists staff_auth_user_id_key;
alter table staff add constraint staff_auth_user_id_key unique (auth_user_id);

-- True for a staff-scoped login (an authenticated user linked to a staff
-- row via auth_user_id), false for a normal owner login. security definer
-- so it can read the staff table itself without recursing into the RLS
-- policies below that call it.
create or replace function is_staff_account()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from staff where auth_user_id = auth.uid());
$$;
grant execute on function is_staff_account() to authenticated;

-- The calling staff-scoped login's own staff.id, or null for an owner login
-- (or for any authenticated user with no linked staff row at all). security
-- definer for the same reason as is_staff_account().
create or replace function current_staff_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from staff where auth_user_id = auth.uid() limit 1;
$$;
grant execute on function current_staff_id() to authenticated;

-- staff: a staff-scoped login can read only their own row, and can never
-- write anything at all (not even their own row) — editing stays an
-- owner-only action from the Staff page.
drop policy if exists "staff-scoped read own row" on staff;
create policy "staff-scoped read own row" as restrictive on staff
  for select to authenticated
  using (not is_staff_account() or id = current_staff_id());

drop policy if exists "staff-scoped no insert" on staff;
create policy "staff-scoped no insert" as restrictive on staff
  for insert to authenticated
  with check (not is_staff_account());

drop policy if exists "staff-scoped no update" on staff;
create policy "staff-scoped no update" as restrictive on staff
  for update to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no delete" on staff;
create policy "staff-scoped no delete" as restrictive on staff
  for delete to authenticated
  using (not is_staff_account());

-- schedule_assignments: a staff-scoped login can read only their own
-- assignments (any job/date, so the staff view can show upcoming ones),
-- never anyone else's, and can never write.
drop policy if exists "staff-scoped read own assignments" on schedule_assignments;
create policy "staff-scoped read own assignments" as restrictive on schedule_assignments
  for select to authenticated
  using (not is_staff_account() or staff_id = current_staff_id());

drop policy if exists "staff-scoped no insert" on schedule_assignments;
create policy "staff-scoped no insert" as restrictive on schedule_assignments
  for insert to authenticated
  with check (not is_staff_account());

drop policy if exists "staff-scoped no update" on schedule_assignments;
create policy "staff-scoped no update" as restrictive on schedule_assignments
  for update to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no delete" on schedule_assignments;
create policy "staff-scoped no delete" as restrictive on schedule_assignments
  for delete to authenticated
  using (not is_staff_account());

-- picture_days: a staff-scoped login can read only a Picture Day they're
-- actually assigned to (via schedule_assignments), never any other job's
-- days, and can never write.
drop policy if exists "staff-scoped read own picture days" on picture_days;
create policy "staff-scoped read own picture days" as restrictive on picture_days
  for select to authenticated
  using (
    not is_staff_account()
    or exists (
      select 1 from schedule_assignments sa
      where sa.picture_day_id = picture_days.id and sa.staff_id = current_staff_id()
    )
  );

drop policy if exists "staff-scoped no insert" on picture_days;
create policy "staff-scoped no insert" as restrictive on picture_days
  for insert to authenticated
  with check (not is_staff_account());

drop policy if exists "staff-scoped no update" on picture_days;
create policy "staff-scoped no update" as restrictive on picture_days
  for update to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no delete" on picture_days;
create policy "staff-scoped no delete" as restrictive on picture_days
  for delete to authenticated
  using (not is_staff_account());

-- jobs: same idea — only a job a staff-scoped login is actually assigned to
-- (schedule_assignments already carries job_id directly), read-only.
drop policy if exists "staff-scoped read own jobs" on jobs;
create policy "staff-scoped read own jobs" as restrictive on jobs
  for select to authenticated
  using (
    not is_staff_account()
    or exists (
      select 1 from schedule_assignments sa
      where sa.job_id = jobs.id and sa.staff_id = current_staff_id()
    )
  );

drop policy if exists "staff-scoped no insert" on jobs;
create policy "staff-scoped no insert" as restrictive on jobs
  for insert to authenticated
  with check (not is_staff_account());

drop policy if exists "staff-scoped no update" on jobs;
create policy "staff-scoped no update" as restrictive on jobs
  for update to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no delete" on jobs;
create policy "staff-scoped no delete" as restrictive on jobs
  for delete to authenticated
  using (not is_staff_account());

-- schools: only a school behind a job a staff-scoped login is assigned to
-- (for the address shown on the staff view), read-only.
drop policy if exists "staff-scoped read own schools" on schools;
create policy "staff-scoped read own schools" as restrictive on schools
  for select to authenticated
  using (
    not is_staff_account()
    or exists (
      select 1 from jobs j
      join schedule_assignments sa on sa.job_id = j.id
      where j.school_id = schools.id and sa.staff_id = current_staff_id()
    )
  );

drop policy if exists "staff-scoped no insert" on schools;
create policy "staff-scoped no insert" as restrictive on schools
  for insert to authenticated
  with check (not is_staff_account());

drop policy if exists "staff-scoped no update" on schools;
create policy "staff-scoped no update" as restrictive on schools
  for update to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no delete" on schools;
create policy "staff-scoped no delete" as restrictive on schools
  for delete to authenticated
  using (not is_staff_account());

-- Everything else a staff-scoped login has no legitimate reason to touch at
-- all (their own past availability answers, other staff's distances,
-- equipment cases, approvals, availability links/notes/send-log) — blocked
-- outright, both read and write. A staff member's own upcoming
-- assignments/times are served through staff_portal_timeline_for_days()
-- below instead, which is narrowly scoped to exactly what the staff view
-- needs.
drop policy if exists "staff-scoped no access" on availability;
create policy "staff-scoped no access" as restrictive on availability
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no access" on availability_links;
create policy "staff-scoped no access" as restrictive on availability_links
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no access" on availability_notes;
create policy "staff-scoped no access" as restrictive on availability_notes
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no access" on availability_submissions;
create policy "staff-scoped no access" as restrictive on availability_submissions
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no access" on availability_send_log;
create policy "staff-scoped no access" as restrictive on availability_send_log
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no access" on schedule_approvals;
create policy "staff-scoped no access" as restrictive on schedule_approvals
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no access" on staff_school_distances;
create policy "staff-scoped no access" as restrictive on staff_school_distances
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

drop policy if exists "staff-scoped no access" on equipment_cases;
create policy "staff-scoped no access" as restrictive on equipment_cases
  for all to authenticated
  using (not is_staff_account())
  with check (not is_staff_account());

-- ---------- Staff portal: cross-app timeline read (security definer) ----------
-- Timeline Builder lives in the same Supabase project (see
-- getTimelineBuilderJobIds in src/lib/data.ts) but its own tb_* tables carry
-- the same "any authenticated user is a full owner" RLS this file used to
-- assume everywhere — a staff-scoped login is a real authenticated user in
-- that same project, so granting it any direct SELECT on tb_jobs/tb_days/
-- tb_timeline_versions would hand it (and anyone else with an equally valid
-- Supabase session) uncontrolled access to ALL of Timeline Builder's data,
-- not just its own arrival/start/end time for its own Picture Days. This
-- function avoids that: it's SECURITY DEFINER (bypasses RLS on the tables
-- it reads internally), but only ever returns rows for a Picture Day the
-- CALLER is actually assigned to (checked against schedule_assignments
-- inside the function, never trusting the picture_day_ids argument on its
-- own) — no new grant on any tb_* table is needed, and a staff-scoped login
-- still has zero direct access to Timeline Builder's tables. Assumes
-- Timeline Builder's own schema (tb_jobs, tb_timeline_versions) already
-- exists in this project, same as getTimelineBuilderJobIds assumes.
--
-- Returns one row per requested Picture Day that (a) this staff member is
-- actually assigned to, (b) has a matching Timeline Builder job
-- (tb_jobs.scheduler_job_id), and (c) has a sent-or-approved timeline
-- version whose snapshot includes that date — exactly the raw fields the
-- app needs to compute arrival/start/end itself (see
-- src/lib/staffPortal.ts), mirroring timeline-builder's own
-- photoStartMinutes()/arrivalRange() arithmetic. A day with no such version
-- (never sent/approved) simply isn't returned — the app shows "TBD" for it.
create or replace function staff_portal_timeline_for_days(p_picture_day_ids uuid[])
returns table(
  picture_day_id uuid,
  school_start_time time,
  end_time time,
  photo_start_offset_minutes integer,
  group_start_offset_minutes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid;
begin
  select id into v_staff_id from staff where auth_user_id = auth.uid();
  if v_staff_id is null then
    return;
  end if;

  return query
  select
    pd.id,
    (day.elem->>'school_start_time')::time,
    (day.elem->>'end_time')::time,
    (day.elem->>'photo_start_offset_minutes')::integer,
    (day.elem->>'group_start_offset_minutes')::integer
  from picture_days pd
  join schedule_assignments sa on sa.picture_day_id = pd.id and sa.staff_id = v_staff_id
  join tb_jobs tj on tj.scheduler_job_id = pd.job_id
  join lateral (
    select v.snapshot
    from tb_timeline_versions v
    where v.job_id = tj.id and (v.approved_at is not null or v.reason = 'sent')
    order by coalesce(v.approved_at, v.created_at) desc
    limit 1
  ) ver on true
  join lateral (
    select elem
    from jsonb_array_elements(ver.snapshot) as elem
    where (elem->>'event_date')::date = pd.date
    limit 1
  ) day on true
  where pd.id = any(p_picture_day_ids);
end;
$$;

grant execute on function staff_portal_timeline_for_days(uuid[]) to authenticated;
