// Create Supabase Storage buckets and set access policies.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const buckets = [
  {
    id: 'klant-fotos',
    public: false,                            // private, alleen via signed URL
    fileSizeLimit: 20 * 1024 * 1024,          // 20 MB per foto
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },
  {
    id: 'julia-public',
    public: true,                             // publieke site-assets (hero foto, logos)
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
];

(async () => {
  const { data: existing } = await supabase.storage.listBuckets();
  const existingIds = new Set((existing || []).map(b => b.id));

  for (const b of buckets) {
    if (existingIds.has(b.id)) {
      console.log(`• ${b.id} — bestaat al`);
      // Update settings to match desired
      const { error: updateErr } = await supabase.storage.updateBucket(b.id, {
        public: b.public,
        fileSizeLimit: b.fileSizeLimit,
        allowedMimeTypes: b.allowedMimeTypes,
      });
      if (updateErr) console.log(`  update error: ${updateErr.message}`);
      else console.log(`  settings bijgewerkt`);
      continue;
    }
    const { error } = await supabase.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
      allowedMimeTypes: b.allowedMimeTypes,
    });
    if (error) {
      console.log(`✗ ${b.id} — ${error.message}`);
    } else {
      console.log(`✓ ${b.id} — aangemaakt (public=${b.public})`);
    }
  }

  console.log('');
  console.log('Done. Storage bucket policies worden via de SQL editor apart opgezet.');
})();
