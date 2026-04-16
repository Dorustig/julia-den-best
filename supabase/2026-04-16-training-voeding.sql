-- =============================================================
-- Julia Besten — Fase 2.4: Training + Voeding schema's
-- Run this in Supabase SQL Editor (once).
-- Idempotent: safe to re-run.
-- =============================================================

-- =============================================================
-- TRAINING_TEMPLATES — herbruikbare trainings-sjablonen
-- Julia bouwt er ooit eentje, hergebruikt 'm voor meerdere klanten.
-- =============================================================
create table if not exists public.training_templates (
  id uuid primary key default uuid_generate_v4(),
  naam text not null,
  beschrijving text,
  content_markdown text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_training_templates_naam on public.training_templates(naam);

do $$ begin
  create trigger trg_training_templates_updated_at before update on public.training_templates
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- =============================================================
-- TRAINING_SCHEMAS — per klant per week een schema
-- Julia schrijft wekelijks (of copy-paste uit template).
-- =============================================================
create table if not exists public.training_schemas (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  week_nr int not null check (week_nr between 1 and 16),
  titel text,
  content_markdown text not null default '',
  template_id uuid references public.training_templates(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(klant_id, week_nr)
);

create index if not exists idx_training_schemas_klant_week on public.training_schemas(klant_id, week_nr);

do $$ begin
  create trigger trg_training_schemas_updated_at before update on public.training_schemas
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- =============================================================
-- VOEDING_TEMPLATES — herbruikbare voedings-sjablonen
-- =============================================================
create table if not exists public.voeding_templates (
  id uuid primary key default uuid_generate_v4(),
  naam text not null,
  beschrijving text,
  calories int,
  eiwit_g int,
  koolhydraten_g int,
  vetten_g int,
  content_markdown text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_voeding_templates_naam on public.voeding_templates(naam);

do $$ begin
  create trigger trg_voeding_templates_updated_at before update on public.voeding_templates
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- =============================================================
-- VOEDING_PLANNEN — per klant één actief voedingsplan
-- =============================================================
create table if not exists public.voeding_plannen (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null unique references public.klanten(id) on delete cascade,
  titel text,
  calories int,
  eiwit_g int,
  koolhydraten_g int,
  vetten_g int,
  content_markdown text not null default '',
  template_id uuid references public.voeding_templates(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_voeding_plannen_klant on public.voeding_plannen(klant_id);

do $$ begin
  create trigger trg_voeding_plannen_updated_at before update on public.voeding_plannen
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
alter table public.training_templates enable row level security;
alter table public.training_schemas enable row level security;
alter table public.voeding_templates enable row level security;
alter table public.voeding_plannen enable row level security;

-- Templates: iedereen met account mag lezen, coach schrijft
drop policy if exists "read_training_templates" on public.training_templates;
create policy "read_training_templates" on public.training_templates
  for select using (true);

drop policy if exists "coach_write_training_templates" on public.training_templates;
create policy "coach_write_training_templates" on public.training_templates
  for all using (public.is_coach()) with check (public.is_coach());

drop policy if exists "read_voeding_templates" on public.voeding_templates;
create policy "read_voeding_templates" on public.voeding_templates
  for select using (true);

drop policy if exists "coach_write_voeding_templates" on public.voeding_templates;
create policy "coach_write_voeding_templates" on public.voeding_templates
  for all using (public.is_coach()) with check (public.is_coach());

-- Training schemas: klant leest eigen, coach alles
drop policy if exists "klant_own_training_schemas" on public.training_schemas;
create policy "klant_own_training_schemas" on public.training_schemas
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

drop policy if exists "coach_write_training_schemas" on public.training_schemas;
create policy "coach_write_training_schemas" on public.training_schemas
  for all using (public.is_coach()) with check (public.is_coach());

-- Voeding plannen: klant leest eigen, coach alles
drop policy if exists "klant_own_voeding_plan" on public.voeding_plannen;
create policy "klant_own_voeding_plan" on public.voeding_plannen
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

drop policy if exists "coach_write_voeding_plannen" on public.voeding_plannen;
create policy "coach_write_voeding_plannen" on public.voeding_plannen
  for all using (public.is_coach()) with check (public.is_coach());

-- =============================================================
-- DONE
-- =============================================================
