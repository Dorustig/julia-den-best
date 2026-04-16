-- =============================================================
-- Julia Besten — Fase 2.5: Chat klant ↔ coach
-- Run this in Supabase SQL Editor (once).
-- Idempotent: safe to re-run.
-- =============================================================

-- =============================================================
-- CHAT_MESSAGES — één rij per bericht
-- van = 'klant' | 'coach' (wie het bericht stuurde)
-- read_at = null zolang ontvanger het niet heeft geopend
-- =============================================================
create table if not exists public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  klant_id uuid not null references public.klanten(id) on delete cascade,
  van text not null check (van in ('klant','coach')),
  content text not null check (length(content) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_chat_klant_created on public.chat_messages(klant_id, created_at desc);
create index if not exists idx_chat_unread on public.chat_messages(klant_id, van) where read_at is null;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
alter table public.chat_messages enable row level security;

-- Klant leest eigen berichten, coach leest alles
drop policy if exists "read_own_chat" on public.chat_messages;
create policy "read_own_chat" on public.chat_messages
  for select using (
    klant_id in (select id from public.klanten where auth_user_id = auth.uid())
    or public.is_coach()
  );

-- Alleen coach schrijft direct via SQL; het server.js proxy doet de rest
drop policy if exists "coach_write_chat" on public.chat_messages;
create policy "coach_write_chat" on public.chat_messages
  for all using (public.is_coach()) with check (public.is_coach());

-- =============================================================
-- DONE
-- =============================================================
