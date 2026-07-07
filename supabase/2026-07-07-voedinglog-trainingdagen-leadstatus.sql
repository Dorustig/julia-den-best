-- =============================================================
-- Julia Besten — 2026-07-07
-- 1. lead_status enum uitbreiden zodat de admin-knoppen werken
--    (gebeld / afspraak / lost bestonden niet in de enum → status
--    wijzigen faalde stil)
-- 2. voeding_logs — klant logt handmatig wat ze eet (Lifesum-idee)
-- 3. training_dagen — weekschema met per dag een training of rustdag
--
-- Run dit in de Supabase SQL Editor. Idempotent: safe to re-run.
-- =============================================================

-- ===== 1. LEAD STATUS ENUM =====
alter type lead_status add value if not exists 'gebeld';
alter type lead_status add value if not exists 'afspraak';
alter type lead_status add value if not exists 'lost';

-- ===== 2. VOEDING_LOGS =====
-- 1 rij per gegeten item. Simpel: maaltijd-moment + omschrijving + kcal
-- (macro's optioneel). Klant beheert eigen rijen, coach leest alles.
create table if not exists public.voeding_logs (
  id uuid primary key default gen_random_uuid(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  datum date not null,
  maaltijd text not null default 'snack',   -- 'ontbijt' | 'lunch' | 'diner' | 'snack'
  omschrijving text not null,
  calories int,
  eiwit_g int,
  koolhydraten_g int,
  vetten_g int,
  created_at timestamptz default now()
);

create index if not exists voeding_logs_klant_datum_idx
  on public.voeding_logs (klant_id, datum desc);

alter table public.voeding_logs enable row level security;

drop policy if exists "klant_sel_own_voedinglog" on public.voeding_logs;
create policy "klant_sel_own_voedinglog" on public.voeding_logs
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );
drop policy if exists "klant_ins_own_voedinglog" on public.voeding_logs;
create policy "klant_ins_own_voedinglog" on public.voeding_logs
  for insert with check (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );
drop policy if exists "klant_del_own_voedinglog" on public.voeding_logs;
create policy "klant_del_own_voedinglog" on public.voeding_logs
  for delete using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );
drop policy if exists "coach_all_voedinglog" on public.voeding_logs;
create policy "coach_all_voedinglog" on public.voeding_logs
  for all using (public.is_coach()) with check (public.is_coach());

-- ===== 3. TRAINING_DAGEN =====
-- Weekschema per klant: per week per dag (1=ma .. 7=zo) een training
-- of rustdag. 'oefeningen' is gestructureerde JSONB zodat de workout-
-- logger ze direct kan voorladen:
--   [{ "naam": "Hip thrust", "sets": 4, "reps": "10-12", "video_url": null }]
create table if not exists public.training_dagen (
  id uuid primary key default gen_random_uuid(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  week_nr int not null check (week_nr between 1 and 16),
  dag smallint not null check (dag between 1 and 7),
  titel text,                                -- 'Billen', 'Upper body', ...
  is_rustdag boolean default false,
  oefeningen jsonb not null default '[]'::jsonb,
  notities text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(klant_id, week_nr, dag)
);

create index if not exists training_dagen_klant_week_idx
  on public.training_dagen (klant_id, week_nr, dag);

do $$ begin
  create trigger trg_training_dagen_updated_at before update on public.training_dagen
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

alter table public.training_dagen enable row level security;

drop policy if exists "klant_sel_own_training_dagen" on public.training_dagen;
create policy "klant_sel_own_training_dagen" on public.training_dagen
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );
drop policy if exists "coach_write_training_dagen" on public.training_dagen;
create policy "coach_write_training_dagen" on public.training_dagen
  for all using (public.is_coach()) with check (public.is_coach());

-- =============================================================
-- DONE
-- =============================================================
