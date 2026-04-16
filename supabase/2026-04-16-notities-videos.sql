-- =============================================================
-- Julia Besten — Fase 2.6: Coach-notities + Video library
-- Run this in Supabase SQL Editor (once).
-- Idempotent: safe to re-run.
-- =============================================================

-- =============================================================
-- COACH_NOTITIES — privé aantekeningen per klant, klant ziet NIETS
-- =============================================================
create table if not exists public.coach_notities (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  content text not null check (length(content) between 1 and 10000),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_coach_notities_klant_created
  on public.coach_notities(klant_id, created_at desc);

do $$ begin
  create trigger trg_coach_notities_updated_at before update on public.coach_notities
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.coach_notities enable row level security;

-- PRIVÉ — alleen coach mag alles. Klant heeft GEEN leesrecht.
drop policy if exists "coach_only_notities" on public.coach_notities;
create policy "coach_only_notities" on public.coach_notities
  for all using (public.is_coach()) with check (public.is_coach());

-- =============================================================
-- VIDEOS — Julia's video library (YouTube URLs, geen eigen opslag)
-- Klanten zien alles, coach beheert.
-- =============================================================
create table if not exists public.videos (
  id uuid primary key default uuid_generate_v4(),
  titel text not null,
  beschrijving text,
  youtube_url text not null,
  youtube_id text,       -- geëxtraheerde YouTube video id, voor thumbnail
  categorie text,        -- 'techniek' | 'mindset' | 'voeding' | 'algemeen'
  volgorde int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_videos_volgorde on public.videos(volgorde asc, created_at desc);
create index if not exists idx_videos_categorie on public.videos(categorie);

do $$ begin
  create trigger trg_videos_updated_at before update on public.videos
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.videos enable row level security;

-- Iedereen ingelogd mag video's lezen; coach schrijft.
drop policy if exists "read_videos" on public.videos;
create policy "read_videos" on public.videos
  for select using (true);

drop policy if exists "coach_write_videos" on public.videos;
create policy "coach_write_videos" on public.videos
  for all using (public.is_coach()) with check (public.is_coach());

-- =============================================================
-- DONE
-- =============================================================
