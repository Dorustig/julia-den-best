// Verify that all tables from schema.sql exist and are accessible.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const expectedTables = [
  'leads', 'klanten', 'doelen', 'check_ins',
  'workout_templates', 'klant_workouts', 'training_logs',
  'foto_uploads', 'berichten', 'videos', 'video_views',
];

(async () => {
  let allOk = true;
  for (const t of expectedTables) {
    const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`✗ ${t.padEnd(20)} — ${error.message}`);
      allOk = false;
    } else {
      console.log(`✓ ${t.padEnd(20)} — OK (${count ?? 0} rows)`);
    }
  }
  console.log('');
  console.log(allOk ? 'All tables present ✓' : 'Some tables missing ✗');
  process.exit(allOk ? 0 : 1);
})();
