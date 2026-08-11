-- =============================================================
-- Julia Besten — 2026-07-27
-- Gram-portie bij voedingslog: klant kan aangeven hoeveel gram ze at
-- (bv. "100 gram eiwitpudding"). Optioneel veld naast de macro's.
-- Idempotent: safe to re-run.
-- =============================================================

alter table public.voeding_logs
  add column if not exists gram int;
