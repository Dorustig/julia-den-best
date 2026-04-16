// Supabase client — server-side helper used throughout server.js.
// Uses the SERVICE KEY which bypasses Row Level Security; that's fine here
// because the server is the only thing that speaks to Supabase on the
// back-end. Clients (browser) never see this key.

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
let isEnabled = false;

if (url && serviceKey) {
  supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  isEnabled = true;
  console.log('[Supabase] enabled — project:', url.replace(/https?:\/\//, '').split('.')[0]);
} else {
  console.log('[Supabase] NOT CONFIGURED — set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
}

/**
 * Upsert a lead into the leads table. Non-blocking: failures are logged
 * but do not throw, so the file-based write remains the source of truth.
 * Returns { ok: boolean, id?: string, error?: string }.
 */
async function saveLead(lead) {
  if (!isEnabled) return { ok: false, error: 'supabase not configured' };

  // Map legacy file format → Supabase schema
  const VALID_STATUS = new Set(['nieuw', 'contact', 'call_gepland', 'klant', 'dood']);
  const status = VALID_STATUS.has(lead.status) ? lead.status : 'nieuw';

  const row = {
    legacy_id: lead.id || null,
    naam: lead.naam || null,
    email: lead.email || null,
    telefoon: lead.telefoon || null,
    instagram: lead.instagram || null,
    leeftijd: lead.leeftijd || null,
    doel_type: lead.doel_type || null,
    nummer_een_doel: lead.nummer_een_doel || null,
    obstakel: lead.obstakel || null,
    urgentie: lead.urgentie != null ? String(lead.urgentie) : null,
    budget: lead.budget || null,
    bereid: lead.bereid || null,
    lang: lead.lang || 'nl',
    bron: lead.bron || 'direct',
    utm_source: lead.utm_source || null,
    utm_medium: lead.utm_medium || null,
    utm_campaign: lead.utm_campaign || null,
    utm_content: lead.utm_content || null,
    referrer: lead.referrer || null,
    status,
    notities_julia: lead.notities || null,
    created_at: lead.timestamp || new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('leads')
      .upsert(row, { onConflict: 'legacy_id' })
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn('[Supabase] saveLead error:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.warn('[Supabase] saveLead exception:', err.message);
    return { ok: false, error: err.message };
  }
}

/** Read all leads from Supabase (for admin dashboard). Returns null on failure. */
async function listLeads(limit = 500) {
  if (!isEnabled) return null;
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[Supabase] listLeads error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[Supabase] listLeads exception:', err.message);
    return null;
  }
}

/** Update a lead. Accepts either a legacy_id or a uuid. */
async function updateLead(idOrLegacyId, patch) {
  if (!isEnabled) return { ok: false, error: 'supabase not configured' };
  try {
    // Try legacy_id first (most likely since we migrate from file)
    let { data, error } = await supabase
      .from('leads')
      .update(patch)
      .eq('legacy_id', idOrLegacyId)
      .select('id')
      .maybeSingle();
    if (!error && data) return { ok: true, id: data.id };

    // Fall back: try as uuid
    ({ data, error } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', idOrLegacyId)
      .select('id')
      .maybeSingle());
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'lead not found' };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Delete a lead. Accepts either a legacy_id or a uuid. */
async function deleteLead(idOrLegacyId) {
  if (!isEnabled) return { ok: false, error: 'supabase not configured' };
  try {
    let { data, error } = await supabase
      .from('leads')
      .delete()
      .eq('legacy_id', idOrLegacyId)
      .select('id')
      .maybeSingle();
    if (!error && data) return { ok: true };

    ({ data, error } = await supabase
      .from('leads')
      .delete()
      .eq('id', idOrLegacyId)
      .select('id')
      .maybeSingle());
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// =============================================================
// KLANT / AUTH HELPERS (Fase 1)
// =============================================================

/**
 * Find a lead by email (case-insensitive). Returns { id, ...fields } or null.
 */
async function getLeadByEmail(email) {
  if (!isEnabled || !email) return null;
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

/**
 * Find a klant by email. Returns record or null.
 */
async function getKlantByEmail(email) {
  if (!isEnabled || !email) return null;
  try {
    const { data, error } = await supabase
      .from('klanten')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

/**
 * Find a klant by Supabase auth user id. Returns record or null.
 */
async function getKlantByAuthUserId(authUserId) {
  if (!isEnabled || !authUserId) return null;
  try {
    const { data, error } = await supabase
      .from('klanten')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

/**
 * Create (or fetch existing) Supabase Auth user for a customer.
 * Uses the Admin API (service key). On success returns { id, email, created }.
 * If the user already exists, returns the existing id with created=false.
 */
async function createOrGetAuthUser(email, { metadata = {}, emailConfirm = true } = {}) {
  if (!isEnabled || !email) return { ok: false, error: 'not configured' };
  try {
    // Look up existing user first (admin.listUsers is paginated — search by email)
    const lookup = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (lookup.error) {
      // fall through to create-attempt, which will fail with a descriptive error
      console.warn('[Supabase] listUsers error:', lookup.error.message);
    } else {
      const existing = (lookup.data?.users || []).find(
        u => u.email && u.email.toLowerCase() === email.toLowerCase()
      );
      if (existing) return { ok: true, id: existing.id, email: existing.email, created: false };
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: emailConfirm,
      user_metadata: metadata,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.user.id, email: data.user.email, created: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Generate a magic-link login URL for an email (Admin API).
 * Returns { ok, action_link } on success — this is the URL to include in
 * your welcome email. You can also send Supabase's default email instead
 * via signInWithOtp from the client.
 */
async function generateMagicLink(email, redirectTo) {
  if (!isEnabled || !email) return { ok: false, error: 'not configured' };
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, action_link: data.properties?.action_link };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Create or upsert a klant row. Used by the Plug&Pay webhook when a new
 * paid order comes in. Looks up matching lead by email to cross-link it.
 */
async function createKlant({
  email,
  naam,
  telefoon = null,
  authUserId = null,
  planPayOrderId = null,
  planPayProductId = null,
}) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!email || !naam) return { ok: false, error: 'email and naam required' };

  try {
    // Cross-link to lead if we have one for this email
    const lead = await getLeadByEmail(email);

    const row = {
      email: email.toLowerCase(),
      naam,
      telefoon,
      auth_user_id: authUserId,
      lead_id: lead?.id || null,
      plan_pay_order_id: planPayOrderId,
      plan_pay_product_id: planPayProductId,
      status: 'onboarding',
    };

    const { data, error } = await supabase
      .from('klanten')
      .upsert(row, { onConflict: 'email' })
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

    // Mark the source lead as converted
    if (lead?.id) {
      await supabase.from('leads').update({ status: 'klant' }).eq('id', lead.id);
    }

    return { ok: true, klant: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Update a klant's onboarding intake data (doel, gewicht, etc.) and flip
 * status to 'actief' once intake is complete.
 */
async function saveIntake(klantId, intake) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  try {
    const patch = {
      doel: intake.doel || null,
      start_gewicht_kg: intake.start_gewicht_kg ?? null,
      doel_gewicht_kg: intake.doel_gewicht_kg ?? null,
      lengte_cm: intake.lengte_cm ?? null,
      leeftijd: intake.leeftijd ?? null,
      allergieen: intake.allergieen || null,
      training_locatie: intake.training_locatie || 'beide',
      trainingsdagen_per_week: intake.trainingsdagen_per_week ?? null,
      ervaring_niveau: intake.ervaring_niveau || null,
      status: 'actief',
    };
    const { data, error } = await supabase
      .from('klanten')
      .update(patch)
      .eq('id', klantId)
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, klant: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Insert or update a weekly check-in. Upserts on (klant_id, datum) so a klant
 * can overwrite their check-in if they make a typo — one canonical row per day.
 * Returns { ok, check_in }.
 */
async function saveCheckIn(klantId, input) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!klantId) return { ok: false, error: 'klantId required' };
  if (input?.gewicht_kg == null) return { ok: false, error: 'gewicht_kg is verplicht' };

  const clampInt = (v, min, max) => {
    if (v == null) return null;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(min, Math.min(max, n));
  };
  const clampNum = (v, min, max) => {
    if (v == null) return null;
    const n = parseFloat(v);
    if (Number.isNaN(n)) return null;
    return Math.max(min, Math.min(max, n));
  };

  const row = {
    klant_id: klantId,
    datum: input.datum || new Date().toISOString().slice(0, 10),
    gewicht_kg: clampNum(input.gewicht_kg, 30, 200),
    taille_cm: clampNum(input.taille_cm, 40, 200),
    heupen_cm: clampNum(input.heupen_cm, 40, 200),
    bil_cm: clampNum(input.bil_cm, 40, 200),
    stappen: clampInt(input.stappen, 0, 50000),
    water_liter: clampNum(input.water_liter, 0, 10),
    slaap_uren: clampNum(input.slaap_uren, 0, 14),
    mood: clampInt(input.mood, 1, 10),
    energie: clampInt(input.energie, 1, 10),
    honger: clampInt(input.honger, 1, 10),
    notities: input.notities ? String(input.notities).slice(0, 2000) : null,
  };

  try {
    const { data, error } = await supabase
      .from('check_ins')
      .upsert(row, { onConflict: 'klant_id,datum' })
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, check_in: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * List all check-ins for a klant, oldest-first (handy for charts).
 * Returns null on failure, [] when empty.
 */
async function listCheckIns(klantId, limit = 200) {
  if (!isEnabled || !klantId) return null;
  try {
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('klant_id', klantId)
      .order('datum', { ascending: true })
      .limit(limit);
    if (error) return null;
    return data;
  } catch { return null; }
}

/**
 * Upload a check-in photo to the check-in-fotos bucket.
 * Path: {klant_id}/{check_in_id}/{positie}.jpg
 * Returns { ok, path } or { ok:false, error }.
 */
async function uploadCheckInFoto({ klantId, checkInId, positie, buffer, contentType }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!klantId || !checkInId || !positie) return { ok: false, error: 'missing ids' };
  if (!['front', 'side', 'back'].includes(positie)) return { ok: false, error: 'invalid positie' };

  const path = `${klantId}/${checkInId}/${positie}.jpg`;
  try {
    const { error } = await supabase.storage
      .from('check-in-fotos')
      .upload(path, buffer, {
        contentType: contentType || 'image/jpeg',
        upsert: true,
      });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * List the photo paths stored for a given check-in.
 * Returns array of { positie, path }.
 */
async function listCheckInFotos(klantId, checkInId) {
  if (!isEnabled || !klantId || !checkInId) return [];
  try {
    const { data, error } = await supabase.storage
      .from('check-in-fotos')
      .list(`${klantId}/${checkInId}`, { limit: 10 });
    if (error) return [];
    return (data || [])
      .filter(f => !f.name.startsWith('.'))
      .map(f => {
        const positie = f.name.replace(/\.jpe?g$|\.png$|\.webp$/i, '');
        return { positie, path: `${klantId}/${checkInId}/${f.name}` };
      });
  } catch { return []; }
}

/**
 * Create a short-lived signed URL for an uploaded check-in photo.
 * expiresIn in seconds (default 10 minutes).
 */
async function signCheckInFoto(path, expiresIn = 600) {
  if (!isEnabled || !path) return null;
  try {
    const { data, error } = await supabase.storage
      .from('check-in-fotos')
      .createSignedUrl(path, expiresIn);
    if (error) return null;
    return data.signedUrl;
  } catch { return null; }
}

/** List all klanten for the admin panel. */
async function listKlanten(limit = 500) {
  if (!isEnabled) return null;
  try {
    const { data, error } = await supabase
      .from('klanten')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return null;
    return data;
  } catch { return null; }
}

/** Verify a Supabase JWT (from Authorization header) and return the user or null. */
async function verifyUserToken(accessToken) {
  if (!isEnabled || !accessToken) return null;
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error) return null;
    return data.user;
  } catch { return null; }
}

module.exports = {
  supabase,
  isEnabled: () => isEnabled,
  // leads
  saveLead,
  listLeads,
  updateLead,
  deleteLead,
  getLeadByEmail,
  // klant + auth
  getKlantByEmail,
  getKlantByAuthUserId,
  createOrGetAuthUser,
  generateMagicLink,
  createKlant,
  saveIntake,
  listKlanten,
  verifyUserToken,
  // check-ins
  saveCheckIn,
  listCheckIns,
  // check-in foto's
  uploadCheckInFoto,
  listCheckInFotos,
  signCheckInFoto,
};
