-- =============================================================
-- Julia Besten — daily_habits tabel
-- Dagelijkse checkboxes + journal voor klanten.
-- Unieke rij per (klant, datum) — upsert flow.
--
-- Defensive: idempotent. Gebruikt IF NOT EXISTS.
-- =============================================================

create table if not exists public.daily_habits (
  id uuid primary key default gen_random_uuid(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  datum date not null,
  water_ok boolean default false,
  slaap_ok boolean default false,
  stappen_ok boolean default false,
  training_ok boolean default false,
  journal text,
  mood_emoji text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists daily_habits_klant_datum_uniq
  on public.daily_habits (klant_id, datum);

create index if not exists daily_habits_klant_idx
  on public.daily_habits (klant_id, datum desc);

alter table public.daily_habits enable row level security;

-- Klant mag eigen rijen lezen / upsert / update
drop policy if exists "klant_sel_own_habits" on public.daily_habits;
create policy "klant_sel_own_habits" on public.daily_habits
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

drop policy if exists "klant_ins_own_habits" on public.daily_habits;
create policy "klant_ins_own_habits" on public.daily_habits
  for insert with check (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

drop policy if exists "klant_upd_own_habits" on public.daily_habits;
create policy "klant_upd_own_habits" on public.daily_habits
  for update using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  ) with check (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

-- Coach mag alles
drop policy if exists "coach_all_habits" on public.daily_habits;
create policy "coach_all_habits" on public.daily_habits
  for all using (public.is_coach()) with check (public.is_coach());
