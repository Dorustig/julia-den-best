-- =============================================================
-- Julia Besten — Database schema
-- Run this in Supabase SQL Editor to create all tables.
-- Idempotent: safe to re-run (uses IF NOT EXISTS everywhere).
-- =============================================================

-- ===== EXTENSIONS =====
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ===== ENUMS =====
do $$ begin
  create type lead_status as enum ('nieuw', 'contact', 'call_gepland', 'klant', 'dood');
exception when duplicate_object then null; end $$;

do $$ begin
  create type klant_status as enum ('onboarding', 'actief', 'pauze', 'afgerond', 'opgezegd');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doel_type as enum ('afvallen', 'billen_aankomen', 'gespierd_aankomen', 'slanker_worden', 'recomposition');
exception when duplicate_object then null; end $$;

do $$ begin
  create type training_locatie as enum ('thuis', 'gym', 'beide');
exception when duplicate_object then null; end $$;

do $$ begin
  create type foto_type as enum ('before', 'progress', 'after');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bericht_van as enum ('klant', 'julia');
exception when duplicate_object then null; end $$;

-- =============================================================
-- 1. LEADS — Mensen die het aanmeldformulier hebben ingevuld
-- =============================================================
create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  legacy_id text unique,               -- voor migratie uit oude json file
  naam text,
  email text,
  telefoon text,
  instagram text,
  leeftijd text,
  doel_type text,
  nummer_een_doel text,
  obstakel text,
  urgentie text,
  budget text,
  bereid text,
  lang text default 'nl',
  bron text default 'direct',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  status lead_status default 'nieuw',
  notities_julia text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_leads_email on public.leads(email);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_created_at on public.leads(created_at desc);

-- =============================================================
-- 2. KLANTEN — Lead wordt klant na betaling via Plug&Pay
-- =============================================================
create table if not exists public.klanten (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  naam text not null,
  email text unique not null,
  telefoon text,
  plan_pay_order_id text unique,
  plan_pay_product_id text,
  start_datum date not null default current_date,
  eind_datum date generated always as (start_datum + interval '16 weeks') stored,
  doel doel_type,
  start_gewicht_kg numeric(5,2),
  doel_gewicht_kg numeric(5,2),
  lengte_cm int,
  leeftijd int,
  allergieen text,
  training_locatie training_locatie default 'beide',
  trainingsdagen_per_week int,
  ervaring_niveau text,
  notities_julia text,
  status klant_status default 'onboarding',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_klanten_auth_user_id on public.klanten(auth_user_id);
create index if not exists idx_klanten_status on public.klanten(status);
create index if not exists idx_klanten_start_datum on public.klanten(start_datum desc);

-- =============================================================
-- 3. DOELEN — Aanvullende doelen naast het hoofddoel
-- =============================================================
create table if not exists public.doelen (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  type text not null,                  -- 'gewicht', 'kracht', 'maten', 'cardio', 'vrij'
  oefening text,                       -- voor kracht-doelen: 'squat', 'hip_thrust', etc.
  start_waarde numeric,
  doel_waarde numeric,
  eenheid text,                        -- 'kg', 'cm', 'reps', 'min'
  deadline date,
  bereikt boolean default false,
  bereikt_op date,
  notities text,
  created_at timestamptz default now()
);

create index if not exists idx_doelen_klant_id on public.doelen(klant_id);

-- =============================================================
-- 4. CHECK_INS — Dagelijkse check-in van klant
-- =============================================================
create table if not exists public.check_ins (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  datum date not null,
  gewicht_kg numeric(5,2),
  taille_cm numeric(5,2),
  heupen_cm numeric(5,2),
  bil_cm numeric(5,2),
  calories int,
  eiwit_g int,
  koolhydraten_g int,
  vetten_g int,
  eten_samenvatting text,
  cardio_type text,
  cardio_minuten int,
  cardio_km numeric(5,2),
  stappen int,
  water_liter numeric(3,1),
  slaap_uren numeric(3,1),
  mood smallint check (mood between 1 and 10),
  energie smallint check (energie between 1 and 10),
  honger smallint check (honger between 1 and 10),
  notities text,
  created_at timestamptz default now(),
  unique(klant_id, datum)
);

create index if not exists idx_check_ins_klant_datum on public.check_ins(klant_id, datum desc);

-- =============================================================
-- 5. WORKOUT_TEMPLATES — Trainings-sjablonen door Julia gemaakt
-- =============================================================
create table if not exists public.workout_templates (
  id uuid primary key default uuid_generate_v4(),
  naam text not null,
  beschrijving text,
  week_nummer int,                     -- welke week van 16, optioneel
  categorie text,                      -- 'upper', 'lower', 'glutes', 'full_body', 'cardio'
  geschatte_duur_min int,
  oefeningen jsonb not null default '[]'::jsonb,
  -- format: [{naam, target_sets, target_reps, target_kg, rust_sec, notities, video_url}]
  is_actief boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_workout_templates_week on public.workout_templates(week_nummer);
create index if not exists idx_workout_templates_actief on public.workout_templates(is_actief);

-- =============================================================
-- 6. KLANT_WORKOUTS — Toewijzing van template aan specifieke klant
-- =============================================================
create table if not exists public.klant_workouts (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  template_id uuid references public.workout_templates(id) on delete set null,
  gepland_voor date,
  custom_oefeningen jsonb,            -- als Julia aanpassingen maakt op template
  voltooid boolean default false,
  voltooid_op timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_klant_workouts_klant_datum on public.klant_workouts(klant_id, gepland_voor);

-- =============================================================
-- 7. TRAINING_LOGS — Wat klant daadwerkelijk heeft getraind
-- =============================================================
create table if not exists public.training_logs (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  klant_workout_id uuid references public.klant_workouts(id) on delete set null,
  datum date not null,
  duur_minuten int,
  oefeningen jsonb not null default '[]'::jsonb,
  -- format: [{naam, sets: [{reps, kg, rpe, klaar_op}]}]
  notities text,
  created_at timestamptz default now()
);

create index if not exists idx_training_logs_klant_datum on public.training_logs(klant_id, datum desc);

-- =============================================================
-- 8. FOTO_UPLOADS — Before/after/progress foto's
-- =============================================================
create table if not exists public.foto_uploads (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  type foto_type not null,
  week_nummer int,
  storage_path text not null,          -- pad in Supabase Storage bucket 'klant-fotos'
  mag_delen boolean default false,     -- opt-in voor publieke/wall-of-wins weergave
  notities text,
  genomen_op date default current_date,
  created_at timestamptz default now()
);

create index if not exists idx_foto_uploads_klant on public.foto_uploads(klant_id, created_at desc);

-- =============================================================
-- 9. BERICHTEN — Chat tussen klant en Julia
-- =============================================================
create table if not exists public.berichten (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  van bericht_van not null,
  inhoud text not null,
  gelezen_door_klant boolean default false,
  gelezen_door_julia boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_berichten_klant on public.berichten(klant_id, created_at desc);

-- =============================================================
-- 10. VIDEOS — Video library (YouTube unlisted links)
-- =============================================================
create table if not exists public.videos (
  id uuid primary key default uuid_generate_v4(),
  titel text not null,
  beschrijving text,
  youtube_id text not null,            -- de video ID, niet de full URL
  hoofdstuk text,                      -- 'Introductie', 'Training', 'Voeding', 'Mindset'
  volgorde int default 0,
  week_nummer int,                     -- welke week de video beschikbaar wordt
  duur_seconden int,
  tags text[],
  vereist_abonnement boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_videos_hoofdstuk_volgorde on public.videos(hoofdstuk, volgorde);
create index if not exists idx_videos_week on public.videos(week_nummer);

-- =============================================================
-- 11. VIDEO_VIEWS — Wie heeft welke video gekeken
-- =============================================================
create table if not exists public.video_views (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  eerst_gekeken_op timestamptz default now(),
  laatst_gekeken_op timestamptz default now(),
  aantal_keer_gekeken int default 1,
  unique(klant_id, video_id)
);

create index if not exists idx_video_views_klant on public.video_views(klant_id);

-- =============================================================
-- TRIGGER — updated_at auto bijwerken
-- =============================================================
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger trg_leads_updated_at before update on public.leads
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_klanten_updated_at before update on public.klanten
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_workout_templates_updated_at before update on public.workout_templates
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_videos_updated_at before update on public.videos
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- =============================================================
-- ROW LEVEL SECURITY — Veiligheid: klant ziet alleen eigen data
-- =============================================================
alter table public.leads enable row level security;
alter table public.klanten enable row level security;
alter table public.doelen enable row level security;
alter table public.check_ins enable row level security;
alter table public.workout_templates enable row level security;
alter table public.klant_workouts enable row level security;
alter table public.training_logs enable row level security;
alter table public.foto_uploads enable row level security;
alter table public.berichten enable row level security;
alter table public.videos enable row level security;
alter table public.video_views enable row level security;

-- Helper function: is huidige user Julia (coach)?
-- Uses auth.jwt() claim 'role' = 'coach' which we set via Supabase Admin API.
create or replace function public.is_coach() returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'user_role', '') = 'coach'
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'coach';
$$;

-- LEADS — alleen coach ziet alles
drop policy if exists "coach_all_leads" on public.leads;
create policy "coach_all_leads" on public.leads
  for all using (public.is_coach()) with check (public.is_coach());

-- KLANTEN — klant ziet eigen record, coach ziet alles
drop policy if exists "klant_own_record" on public.klanten;
create policy "klant_own_record" on public.klanten
  for select using (auth_user_id = auth.uid() or public.is_coach());

drop policy if exists "coach_write_klanten" on public.klanten;
create policy "coach_write_klanten" on public.klanten
  for all using (public.is_coach()) with check (public.is_coach());

-- DOELEN — klant ziet/schrijft eigen, coach alles
drop policy if exists "klant_own_doelen" on public.doelen;
create policy "klant_own_doelen" on public.doelen
  for all using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

-- CHECK_INS — klant ziet/schrijft eigen, coach alles
drop policy if exists "klant_own_check_ins" on public.check_ins;
create policy "klant_own_check_ins" on public.check_ins
  for all using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

-- WORKOUT_TEMPLATES — iedereen met account mag lezen, alleen coach schrijven
drop policy if exists "read_templates" on public.workout_templates;
create policy "read_templates" on public.workout_templates
  for select using (is_actief or public.is_coach());

drop policy if exists "coach_write_templates" on public.workout_templates;
create policy "coach_write_templates" on public.workout_templates
  for all using (public.is_coach()) with check (public.is_coach());

-- KLANT_WORKOUTS — klant ziet eigen, coach alles
drop policy if exists "klant_own_workouts" on public.klant_workouts;
create policy "klant_own_workouts" on public.klant_workouts
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

drop policy if exists "coach_write_klant_workouts" on public.klant_workouts;
create policy "coach_write_klant_workouts" on public.klant_workouts
  for all using (public.is_coach()) with check (public.is_coach());

-- Klant mag wel eigen workouts als "voltooid" markeren
drop policy if exists "klant_mark_voltooid" on public.klant_workouts;
create policy "klant_mark_voltooid" on public.klant_workouts
  for update using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  ) with check (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

-- TRAINING_LOGS — klant ziet/schrijft eigen, coach alles
drop policy if exists "klant_own_training_logs" on public.training_logs;
create policy "klant_own_training_logs" on public.training_logs
  for all using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

-- FOTO_UPLOADS — klant ziet/schrijft eigen, coach alles
drop policy if exists "klant_own_fotos" on public.foto_uploads;
create policy "klant_own_fotos" on public.foto_uploads
  for all using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

-- BERICHTEN — klant ziet/schrijft berichten in eigen gesprek, coach alles
drop policy if exists "klant_own_berichten" on public.berichten;
create policy "klant_own_berichten" on public.berichten
  for all using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

-- VIDEOS — iedereen met account mag lezen, alleen coach schrijven
drop policy if exists "read_videos" on public.videos;
create policy "read_videos" on public.videos
  for select using (true);

drop policy if exists "coach_write_videos" on public.videos;
create policy "coach_write_videos" on public.videos
  for all using (public.is_coach()) with check (public.is_coach());

-- VIDEO_VIEWS — klant schrijft/leest eigen views, coach ziet alles
drop policy if exists "klant_own_video_views" on public.video_views;
create policy "klant_own_video_views" on public.video_views
  for all using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

-- =============================================================
-- DONE
-- =============================================================
