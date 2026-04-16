// Migrate leads from JSON file (Railway volume) to Supabase.
// Idempotent: re-running won't duplicate (uses legacy_id unique constraint).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const src = process.argv[2] || '/tmp/julia-leads-prod.json';

if (!fs.existsSync(src)) {
  console.error(`Source file not found: ${src}`);
  console.error('Usage: node migrate-leads.js [path/to/leads.json]');
  process.exit(1);
}

const rawLeads = JSON.parse(fs.readFileSync(src, 'utf8'));
console.log(`Found ${rawLeads.length} leads in source file`);

// Valid lead_status enum values
const VALID_STATUS = new Set(['nieuw', 'contact', 'call_gepland', 'klant', 'dood']);

function mapLead(l) {
  const status = VALID_STATUS.has(l.status) ? l.status : 'nieuw';
  return {
    legacy_id: l.id || null,
    naam: l.naam || null,
    email: l.email || null,
    telefoon: l.telefoon || null,
    instagram: l.instagram || null,
    leeftijd: l.leeftijd || null,
    doel_type: l.doel_type || null,
    nummer_een_doel: l.nummer_een_doel || null,
    obstakel: l.obstakel || null,
    urgentie: l.urgentie != null ? String(l.urgentie) : null,
    budget: l.budget || null,
    bereid: l.bereid || null,
    lang: l.lang || 'nl',
    bron: l.bron || 'direct',
    utm_source: l.utm_source || null,
    utm_medium: l.utm_medium || null,
    utm_campaign: l.utm_campaign || null,
    utm_content: l.utm_content || null,
    referrer: l.referrer || null,
    status,
    notities_julia: l.notities || null,
    created_at: l.timestamp || new Date().toISOString(),
  };
}

(async () => {
  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  for (const l of rawLeads) {
    const mapped = mapLead(l);
    const { error } = await supabase
      .from('leads')
      .upsert(mapped, { onConflict: 'legacy_id' });

    if (error) {
      errored++;
      console.log(`✗ ${mapped.email || mapped.legacy_id} — ${error.message}`);
    } else {
      inserted++;
      console.log(`✓ ${mapped.email || mapped.legacy_id}`);
    }
  }

  console.log('');
  console.log(`Inserted/updated: ${inserted}`);
  console.log(`Errored: ${errored}`);

  // Verify
  const { count, error: countErr } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true });
  if (!countErr) console.log(`Total leads in Supabase now: ${count}`);
})();
