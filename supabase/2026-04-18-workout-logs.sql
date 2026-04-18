-- =============================================================
-- Julia Besten — workout_logs
-- Klant logt haar daadwerkelijke workout: oefeningen met sets + reps + gewicht.
-- JSONB 'sets' houdt flexibel per-oefening data bij zonder schema-rigidity:
--   [
--     { "naam": "Squats", "sets": [{"reps":10,"gewicht":40},{"reps":8,"gewicht":45}], "note": "" },
--     { "naam": "Hip thrust", "sets": [{"reps":12,"gewicht":60}], "note": "nog 1 rib bij volgende" }
--   ]
-- =============================================================

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  datum date not null,
  week_nr smallint,
  duur_min smallint,               -- totale trainingsduur in minuten (optioneel)
  oefeningen jsonb default '[]'::jsonb,
  notities text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists workout_logs_klant_datum_idx
  on public.workout_logs (klant_id, datum desc);

alter table public.workout_logs enable row level security;

-- Klant mag eigen workouts lezen / insert / update / delete
drop policy if exists "klant_sel_own_workout" on public.workout_logs;
create policy "klant_sel_own_workout" on public.workout_logs
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );
drop policy if exists "klant_ins_own_workout" on public.workout_logs;
create policy "klant_ins_own_workout" on public.workout_logs
  for insert with check (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );
drop policy if exists "klant_upd_own_workout" on public.workout_logs;
create policy "klant_upd_own_workout" on public.workout_logs
  for update using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  ) with check (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );
drop policy if exists "klant_del_own_workout" on public.workout_logs;
create policy "klant_del_own_workout" on public.workout_logs
  for delete using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

-- Coach mag alles
drop policy if exists "coach_all_workout" on public.workout_logs;
create policy "coach_all_workout" on public.workout_logs
  for all using (public.is_coach()) with check (public.is_coach());
