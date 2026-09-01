-- Los vlaggetje op leads: wanneer we de lead via WhatsApp/app hebben benaderd.
-- Staat los van de funnel-status (nieuw/gebeld/afspraak/klant/lost), zodat je
-- "ge-appt" én "afspraak" tegelijk kunt zien.
-- Draai dit één keer in de Supabase SQL Editor.

alter table public.leads
  add column if not exists geappt_at timestamptz;
