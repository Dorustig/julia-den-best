-- =============================================================
-- Julia Besten — coach_todos
-- Dagelijkse/lopende to-do's voor Julia (coach). Kunnen algemene
-- bedrijfstaken zijn of gekoppeld aan een specifieke klant.
--
-- Defensive: idempotent (IF NOT EXISTS).
-- =============================================================

create table if not exists public.coach_todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  klant_id uuid references public.klanten(id) on delete set null,
  done boolean default false,
  due_date date,
  prioriteit smallint default 0,          -- 0=normaal, 1=belangrijk, 2=urgent
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists coach_todos_open_idx
  on public.coach_todos (done, due_date nulls last, created_at desc);

create index if not exists coach_todos_klant_idx
  on public.coach_todos (klant_id)
  where klant_id is not null;

alter table public.coach_todos enable row level security;

-- Alleen coach (service role) mag lezen/schrijven
drop policy if exists "coach_all_todos" on public.coach_todos;
create policy "coach_all_todos" on public.coach_todos
  for all using (public.is_coach()) with check (public.is_coach());
