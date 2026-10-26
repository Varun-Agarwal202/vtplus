-- Run in Supabase SQL Editor (Dashboard → SQL) for a new project.
-- Enables email/password auth under Authentication → Providers.

create table if not exists public.sessions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  duration_s double precision not null,
  position text not null check (position in ('rest', 'postural', 'kinetic')),
  measured_fs_hz double precision not null,
  jitter double precision not null,
  dominant_hz double precision not null,
  dominant_hz_interp double precision not null,
  band_power double precision not null,
  rms_g double precision not null,
  peak_ratio double precision not null,
  spectral_entropy double precision not null,
  lf_motion_rms_g double precision not null,
  quality_flags jsonb not null default '[]'::jsonb,
  analysis_mode text not null check (analysis_mode in ('axes', 'magnitude')),
  sleep text,
  stress integer,
  caffeine boolean,
  meds_taken boolean,
  meds_time text,
  notes text,
  device_model text,
  app_version text,
  raw_path text,
  spectrum_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_user_started_idx on public.sessions (user_id, started_at desc);
create index if not exists sessions_user_position_mode_idx on public.sessions (user_id, position, analysis_mode, started_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.user_settings enable row level security;

alter table public.sessions add column if not exists updated_at timestamptz not null default now();

drop policy if exists "sessions_select_own" on public.sessions;
drop policy if exists "sessions_insert_own" on public.sessions;
drop policy if exists "sessions_update_own" on public.sessions;
drop policy if exists "sessions_delete_own" on public.sessions;
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;

create policy "sessions_select_own"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "sessions_insert_own"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "sessions_update_own"
  on public.sessions for update
  using (auth.uid() = user_id);

create policy "sessions_delete_own"
  on public.sessions for delete
  using (auth.uid() = user_id);

create policy "user_settings_select_own"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "user_settings_insert_own"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "user_settings_update_own"
  on public.user_settings for update
  using (auth.uid() = user_id);

create policy "user_settings_delete_own"
  on public.user_settings for delete
  using (auth.uid() = user_id);
