// Apply the schema.sql to Supabase via the pg endpoint.
// Uses the service role key (never exposed to browser).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

(async () => {
  console.log('Applying schema...');
  // Supabase doesn't expose a direct "run arbitrary SQL" endpoint via REST.
  // We use the management API's SQL endpoint via the `pg` REST proxy.
  // Trick: we create a temporary RPC via the admin REST, but simpler — use psql via db URL.
  // For now: ask the user to paste the SQL into the Supabase SQL Editor.
  // That is the official recommended route for one-shot schema setup.
  console.log('');
  console.log('=============================================================');
  console.log('MANUAL STEP NEEDED (one-time only):');
  console.log('=============================================================');
  console.log('');
  console.log('1. Open: ' + url.replace('.supabase.co', '').replace('https://', 'https://supabase.com/dashboard/project/') + '/sql/new');
  console.log('2. Paste the full contents of  supabase/schema.sql');
  console.log('3. Click "Run"');
  console.log('');
  console.log('(This is the normal Supabase workflow — arbitrary SQL runs');
  console.log(' through the dashboard, not the REST API, for security.)');
  console.log('');
  console.log('After you have run it, come back and tell me "schema klaar".');
})();
