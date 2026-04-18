-- =============================================================
-- Julia Besten — daily_habits: rustdag + voeding_ok kolommen
-- Uitbreiding: klant kan aangeven of een dag een rustdag is
-- (dan hoeft ze geen workout te loggen). Voeding_ok: aparte
-- checkbox voor "voedingsplan gevolgd".
-- =============================================================

alter table public.daily_habits
  add column if not exists rustdag boolean default false;

alter table public.daily_habits
  add column if not exists voeding_ok boolean default false;
