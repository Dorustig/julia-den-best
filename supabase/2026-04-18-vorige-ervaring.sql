-- =============================================================
-- Julia Besten — klanten: vorige_ervaring veld
-- Klant vult bij intake in wat ze in het verleden al hebben
-- geprobeerd (diëten, trainingen, wat werkte, wat niet).
-- Julia gebruikt dit om de coaching gerichter te maken.
-- =============================================================

alter table public.klanten
  add column if not exists vorige_ervaring text;
