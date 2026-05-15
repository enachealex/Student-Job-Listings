-- Run this SQL in Supabase SQL Editor.
-- In Supabase Auth settings, disable public sign-ups.
-- Create admin auth user: enachealex1@gmail.com with temporary password 1234.
-- Set admin user metadata: {"must_change_password": true}.

create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id text primary key,
  entry_mode text not null check (entry_mode in ('url', 'template')),
  role text not null,
  organization text not null,
  location text not null,
  state text not null,
  city text not null,
  type text not null,
  details text not null,
  source_label text not null,
  posting_url text not null default '',
  phone text not null default '',
  pay numeric,
  benefits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_touch_updated_at on public.jobs;
create trigger jobs_touch_updated_at
before update on public.jobs
for each row execute procedure public.touch_updated_at();

alter table public.jobs enable row level security;

create policy if not exists jobs_read_all
on public.jobs
for select
to anon, authenticated
using (true);

create policy if not exists jobs_insert_authenticated
on public.jobs
for insert
to authenticated
with check (
  auth.uid() is not null
);

create policy if not exists jobs_update_authenticated
on public.jobs
for update
to authenticated
using (
  auth.uid() is not null
)
with check (
  auth.uid() is not null
);

create policy if not exists jobs_delete_authenticated
on public.jobs
for delete
to authenticated
using (
  auth.uid() is not null
);
