-- =============================================================
-- Julia Besten — push_subscriptions tabel
-- Bewaart Web Push-inschrijvingen per klant (1 klant kan meerdere
-- devices hebben, bv. telefoon + laptop).
--
-- Defensive: idempotent te runnen. Gebruikt CREATE TABLE IF NOT EXISTS
-- en ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- =============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  last_used_at timestamptz default now()
);

-- Unieke inschrijving per endpoint (endpoint is device-specifiek)
create unique index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_klant_idx
  on public.push_subscriptions (klant_id);

-- RLS
alter table public.push_subscriptions enable row level security;

-- Klant mag eigen subscriptions lezen + insert/delete doen
drop policy if exists "klant_sel_own_push" on public.push_subscriptions;
create policy "klant_sel_own_push" on public.push_subscriptions
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

drop policy if exists "klant_ins_own_push" on public.push_subscriptions;
create policy "klant_ins_own_push" on public.push_subscriptions
  for insert with check (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

drop policy if exists "klant_del_own_push" on public.push_subscriptions;
create policy "klant_del_own_push" on public.push_subscriptions
  for delete using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
  );

-- Coach (service role) mag alles
drop policy if exists "coach_all_push" on public.push_subscriptions;
create policy "coach_all_push" on public.push_subscriptions
  for all using (public.is_coach()) with check (public.is_coach());
