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
