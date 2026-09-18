-- Employer-submitted listing requests + sponsored placement.
-- Run this in the Supabase SQL Editor after supabase-schema.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) Sponsored placement on published listings
-- ---------------------------------------------------------------------------
-- Listing is free. Sponsorship is the paid upgrade: it pins the listing to the
-- top of the list until sponsored_until passes (null = no expiry).
alter table public.jobs
  add column if not exists is_sponsored boolean not null default false;

alter table public.jobs
  add column if not exists sponsored_until timestamptz;

-- County sits alongside city. A listing needs one or the other, not both.
alter table public.jobs
  add column if not exists county text not null default '';

-- ---------------------------------------------------------------------------
-- 2) Employer requests queue
-- ---------------------------------------------------------------------------
-- Rows land here from the public /request-listing form via the
-- submit-job-request edge function. Nothing here is visible to the public:
-- it holds employer contact details, and it is unreviewed content.
create table if not exists public.job_requests (
  id text primary key,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  -- Who to contact about this request
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null default '',

  -- Listing fields, mirroring public.jobs
  entry_mode text not null default 'template'
    check (entry_mode in ('url', 'template')),
  role text not null,
  organization text not null,
  location text not null default '',
  state text not null default '',
  city text not null default '',
  county text not null default '',
  type text not null default '',
  category text not null default 'pta',
  details text not null default '',
  posting_url text not null default '',
  phone text not null default '',
  pay numeric,
  benefits jsonb not null default '[]'::jsonb,

  -- Paid upgrade the employer asked about (not a payment record)
  wants_sponsorship boolean not null default false,

  -- Review trail
  review_note text not null default '',
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  published_job_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_requests_status_created_idx
  on public.job_requests (status, created_at desc);

drop trigger if exists job_requests_touch_updated_at on public.job_requests;
create trigger job_requests_touch_updated_at
before update on public.job_requests
for each row execute procedure public.touch_updated_at();

alter table public.job_requests enable row level security;

-- Deliberately NO anon policy. The public form does not talk to this table
-- directly; it posts to the submit-job-request edge function, which verifies
-- the captcha and inserts with the service role key (service role bypasses RLS).
-- Granting anon insert here would let anyone POST unlimited rows straight to
-- PostgREST, skipping the captcha entirely.

drop policy if exists job_requests_read_staff on public.job_requests;
create policy job_requests_read_staff
on public.job_requests
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists job_requests_update_staff on public.job_requests;
create policy job_requests_update_staff
on public.job_requests
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists job_requests_delete_staff on public.job_requests;
create policy job_requests_delete_staff
on public.job_requests
for delete
to authenticated
using (auth.uid() is not null);
