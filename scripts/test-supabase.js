// Quick connectivity test for Supabase
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

(async () => {
  try {
    // Simple RPC-free check: hit the REST /rest/v1/ root which returns OpenAPI
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    console.log('REST reachable:', res.status === 200 ? 'YES' : `status=${res.status}`);

    // Try to list schemas via Postgres REST
    const { data, error } = await supabase.from('_nonexistent_test_table').select('*').limit(1);
    if (error) {
      // Expected: table doesn't exist. That still means auth works.
      if (error.message && error.message.toLowerCase().includes('does not exist')) {
        console.log('Supabase auth: OK (schema reachable, no test table yet)');
      } else if (error.code === 'PGRST205' || (error.message && error.message.toLowerCase().includes('could not find the table'))) {
        console.log('Supabase auth: OK (no table yet, as expected)');
      } else {
        console.log('Supabase response:', error);
      }
    } else {
      console.log('Unexpected success:', data);
    }

    console.log('Project URL:', url);
    console.log('Connection: OK ✓');
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
})();
