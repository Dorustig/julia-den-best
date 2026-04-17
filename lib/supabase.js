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
 * Whitelist-based klant-update. Gebruikt door de klant-facing
 * /api/klant/profile endpoint — beperkt tot velden die de klant
 * zelf mag wijzigen. Server filtert welke keys doorkomen.
 */
async function updateKlantFields(klantId, patch) {
  if (!isEnabled || !klantId) return { ok: false, error: 'not configured' };
  try {
    const { data, error } = await supabase
      .from('klanten')
      .update(patch)
      .eq('id', klantId)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, klant: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Find a klant by its primary-key id (the `id` column in the klanten table).
 */
async function getKlantById(klantId) {
  if (!isEnabled || !klantId) return null;
  try {
    const { data, error } = await supabase
      .from('klanten')
      .select('*')
      .eq('id', klantId)
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
async function createOrGetAuthUser(email, { metadata = {}, emailConfirm = true, password = null } = {}) {
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
      if (existing) {
        // Als er een password is meegegeven en de user bestaat al, overschrijven.
        // Dat is handig als Julia voor een bestaande klant een nieuw wachtwoord zet.
        if (password) {
          const upd = await supabase.auth.admin.updateUserById(existing.id, { password });
          if (upd.error) console.warn('[Supabase] set password failed:', upd.error.message);
        }
        return { ok: true, id: existing.id, email: existing.email, created: false };
      }
    }

    const createPayload = {
      email,
      email_confirm: emailConfirm,
      user_metadata: metadata,
    };
    if (password) createPayload.password = password;

    const { data, error } = await supabase.auth.admin.createUser(createPayload);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.user.id, email: data.user.email, created: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Set or change a password for an existing auth user.
 * Used when Julia wants to reset a klant's wachtwoord.
 */
async function setPasswordForUser(authUserId, password) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!authUserId || !password) return { ok: false, error: 'missing params' };
  try {
    const { error } = await supabase.auth.admin.updateUserById(authUserId, { password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
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

// =============================================================
// TRAINING TEMPLATES + SCHEMAS (Fase 2.4)
// =============================================================

async function listTrainingTemplates() {
  if (!isEnabled) return null;
  try {
    const { data, error } = await supabase
      .from('training_templates')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) return null;
    return data;
  } catch { return null; }
}

async function getTrainingTemplate(id) {
  if (!isEnabled || !id) return null;
  try {
    const { data, error } = await supabase
      .from('training_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

async function saveTrainingTemplate({ id, naam, beschrijving, content_markdown }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!naam) return { ok: false, error: 'naam is verplicht' };
  const row = {
    naam: String(naam).slice(0, 200),
    beschrijving: beschrijving ? String(beschrijving).slice(0, 500) : null,
    content_markdown: String(content_markdown || '').slice(0, 50000),
  };
  try {
    let data, error;
    if (id) {
      ({ data, error } = await supabase
        .from('training_templates').update(row).eq('id', id).select('*').single());
    } else {
      ({ data, error } = await supabase
        .from('training_templates').insert(row).select('*').single());
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true, template: data };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function deleteTrainingTemplate(id) {
  if (!isEnabled || !id) return { ok: false, error: 'id required' };
  try {
    const { error } = await supabase.from('training_templates').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function listTrainingSchemas(klantId) {
  if (!isEnabled || !klantId) return null;
  try {
    const { data, error } = await supabase
      .from('training_schemas')
      .select('*')
      .eq('klant_id', klantId)
      .order('week_nr', { ascending: true });
    if (error) return null;
    return data;
  } catch { return null; }
}

async function getTrainingSchema(klantId, weekNr) {
  if (!isEnabled || !klantId || !weekNr) return null;
  try {
    const { data, error } = await supabase
      .from('training_schemas')
      .select('*')
      .eq('klant_id', klantId)
      .eq('week_nr', weekNr)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

async function saveTrainingSchema({ klantId, weekNr, titel, content_markdown, template_id }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!klantId) return { ok: false, error: 'klantId required' };
  const wk = parseInt(weekNr, 10);
  if (!wk || wk < 1 || wk > 16) return { ok: false, error: 'week_nr moet 1-16 zijn' };
  const row = {
    klant_id: klantId,
    week_nr: wk,
    titel: titel ? String(titel).slice(0, 200) : null,
    content_markdown: String(content_markdown || '').slice(0, 50000),
    template_id: template_id || null,
  };
  try {
    const { data, error } = await supabase
      .from('training_schemas')
      .upsert(row, { onConflict: 'klant_id,week_nr' })
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, schema: data };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function deleteTrainingSchema(klantId, weekNr) {
  if (!isEnabled || !klantId || !weekNr) return { ok: false, error: 'klantId + weekNr required' };
  try {
    const { error } = await supabase
      .from('training_schemas')
      .delete()
      .eq('klant_id', klantId)
      .eq('week_nr', weekNr);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

// =============================================================
// VOEDING TEMPLATES + PLANNEN (Fase 2.4)
// =============================================================

async function listVoedingTemplates() {
  if (!isEnabled) return null;
  try {
    const { data, error } = await supabase
      .from('voeding_templates')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) return null;
    return data;
  } catch { return null; }
}

async function getVoedingTemplate(id) {
  if (!isEnabled || !id) return null;
  try {
    const { data, error } = await supabase
      .from('voeding_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

async function saveVoedingTemplate({ id, naam, beschrijving, calories, eiwit_g, koolhydraten_g, vetten_g, content_markdown }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!naam) return { ok: false, error: 'naam is verplicht' };
  const clampInt = (v, min, max) => {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(min, Math.min(max, n));
  };
  const row = {
    naam: String(naam).slice(0, 200),
    beschrijving: beschrijving ? String(beschrijving).slice(0, 500) : null,
    calories: clampInt(calories, 0, 6000),
    eiwit_g: clampInt(eiwit_g, 0, 500),
    koolhydraten_g: clampInt(koolhydraten_g, 0, 800),
    vetten_g: clampInt(vetten_g, 0, 400),
    content_markdown: String(content_markdown || '').slice(0, 50000),
  };
  try {
    let data, error;
    if (id) {
      ({ data, error } = await supabase
        .from('voeding_templates').update(row).eq('id', id).select('*').single());
    } else {
      ({ data, error } = await supabase
        .from('voeding_templates').insert(row).select('*').single());
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true, template: data };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function deleteVoedingTemplate(id) {
  if (!isEnabled || !id) return { ok: false, error: 'id required' };
  try {
    const { error } = await supabase.from('voeding_templates').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function getVoedingPlan(klantId) {
  if (!isEnabled || !klantId) return null;
  try {
    const { data, error } = await supabase
      .from('voeding_plannen')
      .select('*')
      .eq('klant_id', klantId)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch { return null; }
}

async function saveVoedingPlan({ klantId, titel, calories, eiwit_g, koolhydraten_g, vetten_g, content_markdown, template_id }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!klantId) return { ok: false, error: 'klantId required' };
  const clampInt = (v, min, max) => {
    if (v == null || v === '') return null;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(min, Math.min(max, n));
  };
  const row = {
    klant_id: klantId,
    titel: titel ? String(titel).slice(0, 200) : null,
    calories: clampInt(calories, 0, 6000),
    eiwit_g: clampInt(eiwit_g, 0, 500),
    koolhydraten_g: clampInt(koolhydraten_g, 0, 800),
    vetten_g: clampInt(vetten_g, 0, 400),
    content_markdown: String(content_markdown || '').slice(0, 50000),
    template_id: template_id || null,
  };
  try {
    const { data, error } = await supabase
      .from('voeding_plannen')
      .upsert(row, { onConflict: 'klant_id' })
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, plan: data };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function deleteVoedingPlan(klantId) {
  if (!isEnabled || !klantId) return { ok: false, error: 'klantId required' };
  try {
    const { error } = await supabase.from('voeding_plannen').delete().eq('klant_id', klantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

// =============================================================
// CHAT (Fase 2.5)
// =============================================================

/** List chat messages for a klant, oldest first. */
async function listChatMessages(klantId, limit = 500) {
  if (!isEnabled || !klantId) return null;
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('klant_id', klantId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return null;
    return data;
  } catch { return null; }
}

/** Insert a new chat message. `van` must be 'klant' or 'coach'. */
async function sendChatMessage({ klantId, van, content }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!klantId) return { ok: false, error: 'klantId required' };
  if (!['klant', 'coach'].includes(van)) return { ok: false, error: 'van must be klant or coach' };
  const txt = String(content || '').trim();
  if (!txt) return { ok: false, error: 'content mag niet leeg zijn' };
  if (txt.length > 4000) return { ok: false, error: 'content te lang (max 4000 tekens)' };

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ klant_id: klantId, van, content: txt })
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: data };
  } catch (err) { return { ok: false, error: err.message }; }
}

/**
 * Mark all messages from a specific sender as read for a klant.
 * Klant opens chat → mark coach msgs as read.
 * Coach opens klant chat → mark klant msgs as read.
 */
async function markChatRead(klantId, vanSender) {
  if (!isEnabled || !klantId) return { ok: false, error: 'klantId required' };
  if (!['klant', 'coach'].includes(vanSender)) return { ok: false, error: 'invalid van' };
  try {
    const { error } = await supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('klant_id', klantId)
      .eq('van', vanSender)
      .is('read_at', null);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Count unread COACH messages for a klant (klant-side badge). */
async function countUnreadForKlant(klantId) {
  if (!isEnabled || !klantId) return 0;
  try {
    const { count, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('klant_id', klantId)
      .eq('van', 'coach')
      .is('read_at', null);
    if (error) return 0;
    return count || 0;
  } catch { return 0; }
}

/**
 * Count unread KLANT messages grouped by klant_id (admin-side badges).
 * Returns { klant_id: count }.
 */
async function countUnreadForCoach() {
  if (!isEnabled) return {};
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('klant_id')
      .eq('van', 'klant')
      .is('read_at', null)
      .limit(5000);
    if (error) return {};
    const counts = {};
    for (const row of data || []) {
      counts[row.klant_id] = (counts[row.klant_id] || 0) + 1;
    }
    return counts;
  } catch { return {}; }
}

// =============================================================
// COACH NOTITIES (Fase 2.6) — privé aantekeningen, klant ziet NOOIT
// =============================================================

async function listCoachNotities(klantId) {
  if (!isEnabled || !klantId) return null;
  try {
    const { data, error } = await supabase
      .from('coach_notities')
      .select('*')
      .eq('klant_id', klantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return null;
    return data;
  } catch { return null; }
}

async function saveCoachNotitie({ id, klantId, content }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  const txt = String(content || '').trim();
  if (!txt) return { ok: false, error: 'content mag niet leeg zijn' };
  if (txt.length > 10000) return { ok: false, error: 'content te lang' };
  try {
    let data, error;
    if (id) {
      ({ data, error } = await supabase
        .from('coach_notities').update({ content: txt })
        .eq('id', id).select('*').single());
    } else {
      if (!klantId) return { ok: false, error: 'klantId vereist' };
      ({ data, error } = await supabase
        .from('coach_notities').insert({ klant_id: klantId, content: txt })
        .select('*').single());
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true, notitie: data };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function deleteCoachNotitie(id) {
  if (!isEnabled || !id) return { ok: false, error: 'id required' };
  try {
    const { error } = await supabase.from('coach_notities').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

// =============================================================
// VIDEO LIBRARY (Fase 2.6) — YouTube URLs
// =============================================================

/** Extract YouTube video id from various URL shapes. */
function extractYoutubeId(url) {
  if (!url) return null;
  const s = String(url);
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/, // raw id
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

async function listVideos() {
  if (!isEnabled) return null;
  try {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('volgorde', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return null;
    return data;
  } catch { return null; }
}

async function saveVideo({ id, titel, beschrijving, youtube_url, categorie, volgorde }) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  if (!titel) return { ok: false, error: 'titel is verplicht' };
  if (!youtube_url) return { ok: false, error: 'youtube_url is verplicht' };
  const youtube_id = extractYoutubeId(youtube_url);
  if (!youtube_id) return { ok: false, error: 'Geen geldige YouTube URL' };

  const row = {
    titel: String(titel).slice(0, 200),
    beschrijving: beschrijving ? String(beschrijving).slice(0, 2000) : null,
    youtube_url: String(youtube_url).slice(0, 500),
    youtube_id,
    categorie: categorie ? String(categorie).slice(0, 40) : null,
    volgorde: Number.isFinite(parseInt(volgorde, 10)) ? parseInt(volgorde, 10) : 0,
  };
  try {
    let data, error;
    if (id) {
      ({ data, error } = await supabase
        .from('videos').update(row).eq('id', id).select('*').single());
    } else {
      ({ data, error } = await supabase
        .from('videos').insert(row).select('*').single());
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true, video: data };
  } catch (err) { return { ok: false, error: err.message }; }
}

async function deleteVideo(id) {
  if (!isEnabled || !id) return { ok: false, error: 'id required' };
  try {
    const { error } = await supabase.from('videos').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

// =============================================================
// ADMIN STATS (Fase 2.6 E) — aggregations over klanten + check-ins
// =============================================================

async function getAdminStats() {
  if (!isEnabled) return null;
  try {
    // Alle klanten
    const { data: klanten, error: e1 } = await supabase
      .from('klanten').select('*');
    if (e1) return null;

    // Alle check-ins (laatste 1000 is ruim genoeg)
    const { data: checkins, error: e2 } = await supabase
      .from('check_ins').select('klant_id, datum, gewicht_kg')
      .order('datum', { ascending: true }).limit(5000);
    if (e2) return null;

    // Group check-ins per klant, vind eerste + laatste
    const byKlant = {};
    for (const ci of checkins || []) {
      if (!byKlant[ci.klant_id]) byKlant[ci.klant_id] = [];
      byKlant[ci.klant_id].push(ci);
    }

    // Per status
    const statusCounts = {};
    let totaalKlanten = 0;
    let totaalGewichtVerschil = 0;
    let klantenMetProgress = 0;
    let klantenOnDoel = 0;
    let klantenAchterlopen = 0;
    const klantenProgress = [];

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    for (const k of klanten || []) {
      totaalKlanten++;
      statusCounts[k.status || 'unknown'] = (statusCounts[k.status || 'unknown'] || 0) + 1;

      const cis = byKlant[k.id] || [];
      const latest = cis[cis.length - 1];

      // Progress berekening
      if (latest && k.start_gewicht_kg != null) {
        const delta = parseFloat(latest.gewicht_kg) - parseFloat(k.start_gewicht_kg);
        totaalGewichtVerschil += delta;
        klantenMetProgress++;

        const goalDown = ['afvallen', 'slanker_worden', 'recomposition'].includes(k.doel);
        const good = goalDown ? delta < 0 : delta > 0;
        if (good) klantenOnDoel++;

        klantenProgress.push({
          id: k.id, naam: k.naam, email: k.email,
          status: k.status,
          start: parseFloat(k.start_gewicht_kg),
          huidig: parseFloat(latest.gewicht_kg),
          delta: +delta.toFixed(1),
          goalDown,
        });
      }

      // Achterlopen: actief maar geen check-in > 10 dagen
      if (k.status === 'actief') {
        if (!latest || (now - new Date(latest.datum).getTime()) > 10 * 86400000) {
          klantenAchterlopen++;
        }
      }
    }

    const gemiddeldDelta = klantenMetProgress > 0
      ? +(totaalGewichtVerschil / klantenMetProgress).toFixed(1)
      : 0;

    // Nieuwe klanten laatste 30 dagen
    const nieuw30d = (klanten || [])
      .filter(k => k.created_at && (now - new Date(k.created_at).getTime()) < 30 * 86400000).length;

    return {
      totaalKlanten,
      nieuw30d,
      klantenAchterlopen,
      actief: statusCounts.actief || 0,
      onboarding: statusCounts.onboarding || 0,
      afgerond: statusCounts.afgerond || 0,
      gepauzeerd: statusCounts.gepauzeerd || 0,
      gestopt: statusCounts.gestopt || 0,
      gemiddeldDeltaKg: gemiddeldDelta,
      klantenOnDoel,
      klantenMetProgress,
      totaalCheckIns: (checkins || []).length,
      topProgress: klantenProgress
        .sort((a, b) => (a.goalDown ? a.delta : -a.delta) - (b.goalDown ? b.delta : -b.delta))
        .slice(0, 5),
    };
  } catch (err) {
    console.warn('[getAdminStats] exception:', err.message);
    return null;
  }
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
  getKlantById,
  getKlantByAuthUserId,
  updateKlantFields,
  createOrGetAuthUser,
  setPasswordForUser,
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
  // training
  listTrainingTemplates,
  getTrainingTemplate,
  saveTrainingTemplate,
  deleteTrainingTemplate,
  listTrainingSchemas,
  getTrainingSchema,
  saveTrainingSchema,
  deleteTrainingSchema,
  // voeding
  listVoedingTemplates,
  getVoedingTemplate,
  saveVoedingTemplate,
  deleteVoedingTemplate,
  getVoedingPlan,
  saveVoedingPlan,
  deleteVoedingPlan,
  // chat
  listChatMessages,
  sendChatMessage,
  markChatRead,
  countUnreadForKlant,
  countUnreadForCoach,
  // coach notities
  listCoachNotities,
  saveCoachNotitie,
  deleteCoachNotitie,
  // videos
  listVideos,
  saveVideo,
  deleteVideo,
  extractYoutubeId,
  // stats
  getAdminStats,
};
