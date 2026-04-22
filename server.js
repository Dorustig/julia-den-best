// ===== JULIA DEN BEST — STANDALONE SERVER =====
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');
const crypto = require('crypto');

// Load .env (dev only — Railway injects env vars directly, no .env file there)
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}

const supabaseHelper = require('./lib/supabase');
const emailHelper = require('./lib/email');
const pushHelper = require('./lib/push');

const PORT = process.env.PORT || 3001;
const ROOT = __dirname;
// DATA_DIR is the persistent volume path on Railway (/app/data).
// Overridable via env var for flexibility.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const LEADS_APPEND_LOG = path.join(DATA_DIR, 'leads-append.jsonl');
const TRACKING_FILE = path.join(DATA_DIR, 'tracking.json');

// Ensure data + backup directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]');
if (!fs.existsSync(TRACKING_FILE)) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify({ ga4: '', metaPixel: '', tiktokPixel: '' }, null, 2));
}

// ===== SELF-HEAL ON STARTUP =====
// If leads.json is empty/corrupted but the append-only log has entries, rebuild
// from the log. This is the last-resort recovery when a volume goes wrong or
// a deploy loses state. Runs once at startup.
(function selfHealLeads() {
  try {
    const current = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    if (!Array.isArray(current)) throw new Error('leads.json not an array');
    if (current.length > 0) {
      console.log(`[SelfHeal] leads.json OK (${current.length} leads).`);
      return;
    }
    if (!fs.existsSync(LEADS_APPEND_LOG)) {
      console.log('[SelfHeal] leads.json empty, no append-log to recover from.');
      return;
    }
    const raw = fs.readFileSync(LEADS_APPEND_LOG, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const seen = new Set();
    const recovered = [];
    for (const line of lines) {
      try {
        const lead = JSON.parse(line);
        if (lead.id && !seen.has(lead.id)) { seen.add(lead.id); recovered.push(lead); }
      } catch {}
    }
    if (recovered.length) {
      fs.writeFileSync(LEADS_FILE, JSON.stringify(recovered, null, 2));
      console.log(`[SelfHeal] REBUILT leads.json from append-log: ${recovered.length} leads recovered.`);
    } else {
      console.log('[SelfHeal] append-log had no valid lines.');
    }
  } catch (e) {
    console.warn('[SelfHeal] failed:', e.message);
  }
})();

// ===== ADMIN URL + AUTH =====
// Un-guessable admin URL slug. The slug hides the admin panel from probes;
// the login behind it hardens it against anyone who does find the URL.
const ADMIN_SLUG = process.env.ADMIN_SLUG || 'portal-j8k3m9q2x7p5v4';
// COACH_SLUG serves the dedicated coach dashboard (coach.html).
// Separate from admin panel so leads-management stays uncluttered.
const COACH_SLUG = process.env.COACH_SLUG || 'coach-h7k3m9p4x2v6q8';
const ADMIN_USER = process.env.ADMIN_USER || 'Dorus';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Deurenzijncool123';
// Tweede admin: Julia (coach zelf). Krijgt dezelfde rechten als Dorus.
const ADMIN_USER_2 = process.env.ADMIN_USER_2 || 'Julia';
const ADMIN_PASS_2 = process.env.ADMIN_PASS_2 || '#Cheesy123';

// Lijst van toegestane (user, pass) combinaties — beide hebben admin rechten.
const ADMIN_CREDENTIALS = [
  { user: ADMIN_USER,   pass: ADMIN_PASS },
  { user: ADMIN_USER_2, pass: ADMIN_PASS_2 },
];

// Session secret used to sign cookies. Generated once and persisted to the
// data volume so sessions survive deploys. Override with env var if desired.
const SECRET_FILE = path.join(DATA_DIR, 'session-secret.txt');
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  try {
    if (fs.existsSync(SECRET_FILE)) {
      SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    } else {
      SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(SECRET_FILE, SESSION_SECRET);
    }
  } catch (e) {
    console.warn('[Auth] secret persistence failed:', e.message);
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_COOKIE = 'jdb_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  // Constant-time compare
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(p => {
    const idx = p.indexOf('=');
    if (idx < 0) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}
function getSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[SESSION_COOKIE]);
}
function isHttps(req) {
  // Railway proxies HTTPS → this header is set; local dev is plain HTTP.
  return (req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https' ||
         req.connection?.encrypted === true;
}
function setSessionCookie(req, res, token) {
  // HttpOnly so JS can't read it; SameSite=Lax so form POSTs work; Secure
  // only over HTTPS (skipped on localhost so login works in dev).
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`);
}
function clearSessionCookie(req, res) {
  const secure = isHttps(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);
}
function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    jsonRes(res, 401, { error: 'Auth required' });
    return false;
  }
  return true;
}

// MIME types
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.xml': 'application/xml',
  '.md': 'text/markdown; charset=utf-8',
};

// ===== HELPERS =====
function readLeads() {
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8')); }
  catch { return []; }
}
// Atomic write: write to temp file then rename (rename is atomic on POSIX).
// Prevents corrupted leads.json on crash/deploy mid-write.
function writeLeads(leads) {
  const json = JSON.stringify(leads, null, 2);
  const tmp = LEADS_FILE + '.tmp';
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, LEADS_FILE);
  // Auto-backup: daily snapshot (overwritten per day)
  try {
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(BACKUP_DIR, `leads-${today}.json`), json);
  } catch (e) { console.warn('[Backup] daily snapshot failed:', e.message); }
}
// Append-only log: every lead is appended as a JSON line. This file is NEVER
// rewritten, so even if leads.json gets corrupted or a deploy loses state,
// the full lead history can be reconstructed from this log.
function appendLeadLog(lead) {
  try {
    fs.appendFileSync(LEADS_APPEND_LOG, JSON.stringify(lead) + '\n');
  } catch (e) { console.warn('[AppendLog] failed:', e.message); }
}
// Deduplicate by lead id — needed because clients may retry the same lead
// multiple times from their queue during deploy.
function leadExists(leads, id) {
  return id && leads.some(l => l.id === id);
}
function leadsToCSV(leads) {
  const headers = ['id','timestamp','naam','email','telefoon','instagram','leeftijd','doel_type','nummer_een_doel','obstakel','urgentie','budget','bereid','status','bron','utm_source','utm_medium','utm_campaign','utm_content','referrer','lang','notities'];
  const escape = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map(l => headers.map(h => escape(l[h])).join(','));
  return '\uFEFF' + [headers.join(','), ...rows].join('\n');
}
function listBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { file: f, size: stat.size, modified: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
  } catch { return []; }
}
function jsonRes(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { req.destroy(); reject(new Error('Too large')); return; }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ===== SERVER =====
// ===== CANONICAL HOST REDIRECT =====
// Main domain is www.juliabesten.nl (GoDaddy doesn't allow CNAME at apex, so
// the apex juliabesten.nl is forwarded to www via GoDaddy Domain Forwarding).
// Anything else (juliabesten.com, bare juliabesten.nl if it leaks through,
// Railway preview URL) gets a 301 to the canonical host so Google/AI merge
// signals on one URL instead of splitting them across duplicate sites.
const CANONICAL_HOST = 'www.juliabesten.nl';
const ALLOWED_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function redirectToCanonical(req, res) {
  const rawHost = (req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  if (!rawHost) return false;
  const host = rawHost.split(':')[0];
  // Don't redirect when running locally or already on the canonical host.
  if (host === CANONICAL_HOST) return false;
  if (ALLOWED_LOCAL_HOSTS.has(host)) return false;
  // Every non-canonical host (juliabesten.com, bare juliabesten.nl,
  // *.up.railway.app) gets a 301 to https://www.juliabesten.nl with the
  // same path + query preserved.
  const target = `https://${CANONICAL_HOST}${req.url}`;
  res.writeHead(301, { Location: target, 'Cache-Control': 'public, max-age=3600' });
  res.end();
  return true;
}

const server = http.createServer(async (req, res) => {
  // Canonical host redirect must run before anything else — otherwise we'd
  // process the request twice (once on .com, once on .nl).
  if (redirectToCanonical(req, res)) return;

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Version-stamp om te kunnen debuggen welke deploy draait.
  res.setHeader('X-App-Version', 'coach-split-v3');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Redirect the predictable /admin paths to the public landing page —
  // anyone guessing lands on the regular site, not a 404 that hints at admin.
  // /coach is a public alias (see isCoachSlug below), but /coach.html blijft
  // verborgen zodat raw HTML-probes niks leveren.
  if (pathname === '/admin.html' || pathname === '/admin' || pathname === '/admin/' ||
      pathname === '/coach.html') {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  // ===== AUTH ROUTES =====

  // POST /api/login — exchange username+password for a session cookie
  if (pathname === '/api/login' && req.method === 'POST') {
    let creds;
    try { creds = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    // Trim — defensive against clients that send a trailing newline/space.
    const user = String(creds.username || '').trim();
    const pass = String(creds.password || '').trim();
    // Check tegen alle toegestane (user, pass) combinaties.
    // Constant-time compare op beide velden (user + pass) om timing-leaks te
    // vermijden. We lopen AL-TIJD door alle credentials — ook als de eerste
    // al matcht — zodat response-tijd niet verraadt welke user geprobeerd is.
    const userBuf = Buffer.from(user.padEnd(64, '\0').slice(0, 64));
    const passBuf = Buffer.from(pass.padEnd(64, '\0').slice(0, 64));
    let matchedUser = null;
    for (const cred of ADMIN_CREDENTIALS) {
      const expectedUser = Buffer.from(cred.user.padEnd(64, '\0').slice(0, 64));
      const expectedPass = Buffer.from(cred.pass.padEnd(64, '\0').slice(0, 64));
      const uOk = crypto.timingSafeEqual(userBuf, expectedUser);
      const pOk = crypto.timingSafeEqual(passBuf, expectedPass);
      if (uOk && pOk && !matchedUser) matchedUser = cred.user;
    }
    if (!matchedUser) {
      return jsonRes(res, 401, { error: 'Ongeldige gebruikersnaam of wachtwoord' });
    }
    const token = signToken({ user: matchedUser, role: 'admin', exp: Date.now() + SESSION_TTL_MS });
    setSessionCookie(req, res, token);
    // Default post-login destination is the coach dashboard (primary daily workflow).
    // The leads/admin portal is a secondary page, reachable from the coach sidebar.
    return jsonRes(res, 200, { success: true, redirect: '/coach' });
  }

  // POST /api/logout — clear session cookie
  if (pathname === '/api/logout' && req.method === 'POST') {
    clearSessionCookie(req, res);
    return jsonRes(res, 200, { success: true });
  }

  // GET /api/me — return current session (used by frontend to know who's logged in)
  if (pathname === '/api/me' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) return jsonRes(res, 401, { error: 'Not logged in' });
    return jsonRes(res, 200, { user: session.user, role: session.role });
  }

  // GET /api/admin/portal-url — returns the secret admin/leads-portal URL.
  // Used by coach.html to link back to the leads portal without hard-coding
  // the slug in HTML (keeps the secret out of the served bundle).
  if (pathname === '/api/admin/portal-url' && req.method === 'GET') {
    if (!getSession(req)) return jsonRes(res, 401, { error: 'Not logged in' });
    return jsonRes(res, 200, { url: `/${ADMIN_SLUG}` });
  }

  // GET /api/admin/coach-url — returns the coach-dashboard URL.
  // Used by admin.html to link over to the coaching workspace.
  if (pathname === '/api/admin/coach-url' && req.method === 'GET') {
    if (!getSession(req)) return jsonRes(res, 401, { error: 'Not logged in' });
    return jsonRes(res, 200, { url: '/coach' });
  }

  // GET /api/config — public config for the browser Supabase SDK.
  // The anon key is safe to expose: Row Level Security on Supabase ensures
  // that even with this key, clients can only see their own data.
  if (pathname === '/api/config' && req.method === 'GET') {
    return jsonRes(res, 200, {
      supabase_url: process.env.SUPABASE_URL || '',
      supabase_anon_key: process.env.SUPABASE_ANON_KEY || '',
      site_origin: process.env.SITE_ORIGIN || `https://${CANONICAL_HOST}`,
      vapid_public_key: pushHelper.isEnabled() ? pushHelper.getPublicKey() : null,
    });
  }

  // ===== PLUG&PAY WEBHOOK =====
  // Plug&Pay sends a POST when an order is paid. We create a Supabase auth
  // user + klanten row and (optionally) trigger a magic link email.
  if (pathname === '/api/webhooks/plugandpay' && req.method === 'POST') {
    const rawBody = await readBody(req);

    // Optional HMAC verification — Plug&Pay signs the body when a secret is
    // configured in their dashboard. Header name varies by provider; we
    // check several common variants.
    const secret = process.env.PLUGANDPAY_WEBHOOK_SECRET;
    if (secret) {
      const sigHeader =
        req.headers['x-pnp-signature'] ||
        req.headers['x-signature'] ||
        req.headers['x-webhook-signature'] ||
        '';
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const given = String(sigHeader).replace(/^sha256=/, '').trim();
      if (!given || given.length !== expected.length ||
          !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
        console.warn('[Plug&Pay webhook] signature mismatch');
        return jsonRes(res, 401, { error: 'Invalid signature' });
      }
    } else {
      console.warn('[Plug&Pay webhook] PLUGANDPAY_WEBHOOK_SECRET not set — accepting without verification');
    }

    let payload;
    try { payload = JSON.parse(rawBody); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }

    console.log('[Plug&Pay webhook] event:', payload.event || payload.type || '?',
                '| order:', payload.id || payload.order_id || payload.order?.id || '?');

    // Extract customer info — Plug&Pay payload shapes vary. Look in several
    // common locations so this works even if their schema changes slightly.
    const customer = payload.customer || payload.buyer || payload.user || payload;
    const email = (customer.email || payload.email || '').toLowerCase().trim();
    const firstname = customer.firstname || customer.first_name || customer.voornaam || '';
    const lastname = customer.lastname || customer.last_name || customer.achternaam || '';
    const naam = (customer.name || `${firstname} ${lastname}`).trim() || email;
    const telefoon = customer.phone || customer.telefoon || null;
    const orderId = String(payload.id || payload.order_id || payload.order?.id || '') || null;
    const productId = String(
      payload.product_id || payload.product?.id ||
      (payload.products && payload.products[0]?.id) || ''
    ) || null;

    // Ignore non-payment events so test pings or subscription changes don't
    // create klanten. Accept any event name that looks like a successful payment.
    const eventName = String(payload.event || payload.type || 'payment').toLowerCase();
    const paymentLike = /paid|success|completed|payment|order_created|new/.test(eventName);
    if (!paymentLike) {
      console.log('[Plug&Pay webhook] ignoring event:', eventName);
      return jsonRes(res, 200, { ignored: true, event: eventName });
    }

    if (!email) {
      return jsonRes(res, 400, { error: 'Missing email in payload' });
    }

    // Idempotent: skip if we already processed this order_id
    if (orderId && supabaseHelper.isEnabled()) {
      const existing = await supabaseHelper.getKlantByEmail(email);
      if (existing && existing.plan_pay_order_id === orderId) {
        return jsonRes(res, 200, { ok: true, duplicate: true, klant_id: existing.id });
      }
    }

    // 1. Genereer een mens-vriendelijk wachtwoord (consonant-klinker ritme, 4 cijfers).
    // Julia wil dat klanten met email + wachtwoord kunnen inloggen, dus we
    // zetten er meteen eentje op bij aankoop.
    const cons = 'bcdfghjkmnpqrstvwxz';
    const vow = 'aeiouy';
    const syl = () => {
      const b = crypto.randomBytes(4);
      return cons[b[0] % cons.length] + vow[b[1] % vow.length] + cons[b[2] % cons.length] + vow[b[3] % vow.length];
    };
    const nr = String(1000 + (crypto.randomBytes(2).readUInt16BE(0) % 9000));
    const generatedPassword = syl() + '-' + syl() + nr;

    // 2. Create (or fetch) Supabase auth user — met wachtwoord
    const authRes = await supabaseHelper.createOrGetAuthUser(email, {
      metadata: { naam, plan_pay_order_id: orderId },
      emailConfirm: true,
      password: generatedPassword,
    });
    if (!authRes.ok) {
      console.error('[Plug&Pay webhook] auth create failed:', authRes.error);
      return jsonRes(res, 500, { error: 'Auth user create failed: ' + authRes.error });
    }

    // 3. Create klant row
    const klantRes = await supabaseHelper.createKlant({
      email,
      naam,
      telefoon,
      authUserId: authRes.id,
      planPayOrderId: orderId,
      planPayProductId: productId,
    });
    if (!klantRes.ok) {
      console.error('[Plug&Pay webhook] klant create failed:', klantRes.error);
      return jsonRes(res, 500, { error: 'Klant create failed: ' + klantRes.error });
    }

    console.log('[Plug&Pay webhook] klant aangemaakt:', email, 'id:', klantRes.klant.id);

    // 4. Welkomstmail met email + wachtwoord — fire and forget
    const siteOrigin = process.env.SITE_ORIGIN || `https://${CANONICAL_HOST}`;
    if (emailHelper.isEnabled()) {
      emailHelper.sendWelcomeEmail({
        to: email, naam,
        loginUrl: siteOrigin + '/klant/login',
        email,
        password: generatedPassword,
      }).catch(e => console.warn('[Plug&Pay webhook] welkomstmail failed:', e.message));
    }

    return jsonRes(res, 200, {
      ok: true,
      klant_id: klantRes.klant.id,
      auth_user_id: authRes.id,
      new_user: authRes.created,
    });
  }

  // ===== KLANT API =====

  // GET /api/klant/me — current klant profile (requires Supabase JWT in Authorization: Bearer)
  if (pathname === '/api/klant/me' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found for this user' });
    return jsonRes(res, 200, { klant });
  }

  // PUT /api/klant/profile — klant werkt zelf een paar velden bij.
  // Whitelist: naam, telefoon, doel_gewicht_kg. Andere velden negeren we
  // (startgewicht, doel, lengte etc. blijven via Julia lopen).
  if (pathname === '/api/klant/profile' && req.method === 'PUT') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });

    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }

    const patch = {};
    if (typeof body.naam === 'string') {
      const n = body.naam.trim();
      if (n.length < 2) return jsonRes(res, 400, { error: 'Naam moet minstens 2 tekens zijn' });
      patch.naam = n;
    }
    if (typeof body.telefoon === 'string' || body.telefoon === null) {
      patch.telefoon = body.telefoon ? String(body.telefoon).trim() : null;
    }
    if (body.doel_gewicht_kg !== undefined) {
      const g = body.doel_gewicht_kg === null || body.doel_gewicht_kg === '' ? null : parseFloat(body.doel_gewicht_kg);
      if (g !== null && (isNaN(g) || g < 30 || g > 200)) return jsonRes(res, 400, { error: 'Ongeldig doelgewicht (30-200 kg)' });
      patch.doel_gewicht_kg = g;
    }
    // Intake-velden — klant mag deze zelf bijwerken
    if (body.lengte_cm !== undefined) {
      const l = body.lengte_cm === null || body.lengte_cm === '' ? null : parseInt(body.lengte_cm, 10);
      if (l !== null && (isNaN(l) || l < 120 || l > 230)) return jsonRes(res, 400, { error: 'Ongeldige lengte (120-230 cm)' });
      patch.lengte_cm = l;
    }
    if (body.leeftijd !== undefined) {
      const a = body.leeftijd === null || body.leeftijd === '' ? null : parseInt(body.leeftijd, 10);
      if (a !== null && (isNaN(a) || a < 13 || a > 99)) return jsonRes(res, 400, { error: 'Ongeldige leeftijd' });
      patch.leeftijd = a;
    }
    if (body.training_locatie !== undefined) {
      const ok = ['thuis', 'gym', 'beide', null].includes(body.training_locatie);
      if (!ok) return jsonRes(res, 400, { error: 'Ongeldige training_locatie' });
      patch.training_locatie = body.training_locatie;
    }
    if (body.trainingsdagen_per_week !== undefined) {
      const d = body.trainingsdagen_per_week === null || body.trainingsdagen_per_week === '' ? null : parseInt(body.trainingsdagen_per_week, 10);
      if (d !== null && (isNaN(d) || d < 1 || d > 7)) return jsonRes(res, 400, { error: 'Trainingsdagen 1-7' });
      patch.trainingsdagen_per_week = d;
    }
    if (body.ervaring_niveau !== undefined) {
      const ok = ['beginner', 'gemiddeld', 'gevorderd', null].includes(body.ervaring_niveau);
      if (!ok) return jsonRes(res, 400, { error: 'Ongeldig ervaring_niveau' });
      patch.ervaring_niveau = body.ervaring_niveau;
    }
    if (body.allergieen !== undefined) {
      patch.allergieen = body.allergieen ? String(body.allergieen).trim().slice(0, 2000) : null;
    }
    if (body.vorige_ervaring !== undefined) {
      patch.vorige_ervaring = body.vorige_ervaring ? String(body.vorige_ervaring).trim().slice(0, 3000) : null;
    }
    if (Object.keys(patch).length === 0) return jsonRes(res, 400, { error: 'Geen velden om bij te werken' });

    const upd = await supabaseHelper.updateKlantFields(klant.id, patch);
    if (!upd.ok) return jsonRes(res, 500, { error: upd.error });
    return jsonRes(res, 200, { ok: true, klant: upd.klant });
  }

  // POST /api/klant/intake — save intake form (requires Supabase JWT)
  if (pathname === '/api/klant/intake' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });

    let intake;
    try { intake = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }

    const result = await supabaseHelper.saveIntake(klant.id, intake);
    if (!result.ok) return jsonRes(res, 400, { error: result.error });
    return jsonRes(res, 200, { ok: true, klant: result.klant });
  }

  // POST /api/klant/checkin — insert or update weekly check-in (requires JWT)
  // Body: { datum, gewicht_kg, taille_cm?, heupen_cm?, bil_cm?, stappen?, water_liter?, slaap_uren?, mood?, energie?, honger?, notities? }
  // Uses upsert on (klant_id, datum) so a klant can overwrite today's check-in.
  if (pathname === '/api/klant/checkin' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });

    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }

    const result = await supabaseHelper.saveCheckIn(klant.id, body);
    if (!result.ok) return jsonRes(res, 400, { error: result.error });
    return jsonRes(res, 200, { ok: true, check_in: result.check_in });
  }

  // GET /api/klant/checkins — list own check-ins (requires JWT), incl. foto paths/urls
  if (pathname === '/api/klant/checkins' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });

    const rows = await supabaseHelper.listCheckIns(klant.id);
    // Attach signed foto urls (client wants to display thumbnails)
    const enriched = await Promise.all((rows || []).map(async (ci) => {
      const fotos = await supabaseHelper.listCheckInFotos(klant.id, ci.id);
      const withUrls = await Promise.all(fotos.map(async (f) => ({
        positie: f.positie,
        path: f.path,
        signed_url: await supabaseHelper.signCheckInFoto(f.path, 1800),
      })));
      return { ...ci, fotos: withUrls };
    }));
    return jsonRes(res, 200, { check_ins: enriched });
  }

  // GET /api/klant/daily-habit?datum=YYYY-MM-DD → rij voor vandaag (of gevraagde datum)
  if (pathname === '/api/klant/daily-habit' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    const datum = parsed.query.datum || new Date().toISOString().slice(0, 10);
    const habit = await supabaseHelper.getDailyHabit(klant.id, datum);
    return jsonRes(res, 200, { habit });
  }

  // POST /api/klant/daily-habit — upsert voor 1 datum (defaults to vandaag).
  // Body: { datum?, water_ok?, slaap_ok?, stappen_ok?, training_ok?, journal?, mood_emoji? }
  if (pathname === '/api/klant/daily-habit' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const datum = body.datum || new Date().toISOString().slice(0, 10);
    const patch = {};
    ['water_ok', 'slaap_ok', 'stappen_ok', 'training_ok', 'voeding_ok', 'rustdag'].forEach(k => {
      if (body[k] !== undefined) patch[k] = !!body[k];
    });
    if (body.journal !== undefined) patch.journal = body.journal ? String(body.journal).slice(0, 2000) : null;
    if (body.mood_emoji !== undefined) patch.mood_emoji = body.mood_emoji ? String(body.mood_emoji).slice(0, 8) : null;
    const r = await supabaseHelper.saveDailyHabit(klant.id, datum, patch);
    if (!r.ok) return jsonRes(res, 500, { error: r.error });
    return jsonRes(res, 200, { ok: true, habit: r.habit });
  }

  // GET /api/admin/klanten/:klantId/daily-habits — coach bekijkt historie
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/daily-habits$/i);
    if (m && req.method === 'GET') {
      if (!requireAuth(req, res)) return;
      const days = parseInt(parsed.query.days || '30', 10);
      const habits = await supabaseHelper.listDailyHabits(m[1], days);
      return jsonRes(res, 200, { habits });
    }
  }

  // ===== WORKOUT LOGS (klant) =====
  if (pathname === '/api/klant/workouts' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile' });
    const workouts = await supabaseHelper.listWorkoutLogs(klant.id);
    return jsonRes(res, 200, { workouts });
  }
  if (pathname === '/api/klant/workouts' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const r = await supabaseHelper.saveWorkoutLog({
      klantId: klant.id,
      datum: body.datum,
      weekNr: body.week_nr,
      duurMin: body.duur_min,
      oefeningen: Array.isArray(body.oefeningen) ? body.oefeningen : [],
      notities: body.notities,
      id: body.id || null,
    });
    if (!r.ok) return jsonRes(res, 400, { error: r.error });
    return jsonRes(res, 200, { ok: true, workout: r.workout });
  }
  {
    const m = pathname.match(/^\/api\/klant\/workouts\/([0-9a-f-]+)$/i);
    if (m && req.method === 'DELETE') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const user = await supabaseHelper.verifyUserToken(token);
      if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
      const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
      if (!klant) return jsonRes(res, 404, { error: 'No klant profile' });
      // Check ownership
      const w = await supabaseHelper.getWorkoutLog(m[1]);
      if (!w || w.klant_id !== klant.id) return jsonRes(res, 403, { error: 'Niet van jou' });
      const r = await supabaseHelper.deleteWorkoutLog(m[1]);
      if (!r.ok) return jsonRes(res, 400, { error: r.error });
      return jsonRes(res, 200, { ok: true });
    }
  }

  // Coach bekijkt workout-logs van een klant
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/workouts$/i);
    if (m && req.method === 'GET') {
      if (!requireAuth(req, res)) return;
      const workouts = await supabaseHelper.listWorkoutLogs(m[1]);
      return jsonRes(res, 200, { workouts });
    }
  }

  // ===== COACH EDIT KLANT (specifiek klant-profiel vanuit coach-dashboard) =====
  // PUT /api/admin/klanten/:klantId  → Julia past klantprofiel aan
  // DELETE /api/admin/klanten/:klantId → archiveren (status = gestopt)
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)$/i);
    if (m && req.method === 'PUT') {
      if (!requireAuth(req, res)) return;
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
      // Coach mag meer velden bewerken dan klant
      const allowedKeys = [
        'naam', 'email', 'telefoon',
        'status', 'doel',
        'start_gewicht_kg', 'doel_gewicht_kg',
        'lengte_cm', 'leeftijd',
        'training_locatie', 'trainingsdagen_per_week', 'ervaring_niveau',
        'allergieen', 'vorige_ervaring', 'notities_julia',
        'start_datum', 'eind_datum',
      ];
      const patch = {};
      for (const k of allowedKeys) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      if (Object.keys(patch).length === 0) return jsonRes(res, 400, { error: 'Geen velden' });
      const upd = await supabaseHelper.updateKlantFields(m[1], patch);
      if (!upd.ok) return jsonRes(res, 500, { error: upd.error });
      return jsonRes(res, 200, { ok: true, klant: upd.klant });
    }
    if (m && req.method === 'DELETE') {
      if (!requireAuth(req, res)) return;
      // Soft-delete: status = gestopt. Harde delete is te riskant (FK cascades).
      const upd = await supabaseHelper.updateKlantFields(m[1], { status: 'gestopt' });
      if (!upd.ok) return jsonRes(res, 500, { error: upd.error });
      return jsonRes(res, 200, { ok: true, klant: upd.klant });
    }
  }

  // Coach verwijdert een check-in
  {
    const m = pathname.match(/^\/api\/admin\/checkins\/([0-9a-f-]+)$/i);
    if (m && req.method === 'DELETE') {
      if (!requireAuth(req, res)) return;
      try {
        const { error } = await supabaseHelper.supabase
          .from('check_ins').delete().eq('id', m[1]);
        if (error) return jsonRes(res, 500, { error: error.message });
        return jsonRes(res, 200, { ok: true });
      } catch (err) { return jsonRes(res, 500, { error: err.message }); }
    }
  }

  // Coach verwijdert een workout-log
  {
    const m = pathname.match(/^\/api\/admin\/workouts\/([0-9a-f-]+)$/i);
    if (m && req.method === 'DELETE') {
      if (!requireAuth(req, res)) return;
      const r = await supabaseHelper.deleteWorkoutLog(m[1]);
      if (!r.ok) return jsonRes(res, 500, { error: r.error });
      return jsonRes(res, 200, { ok: true });
    }
  }

  // POST /api/klant/checkin-foto — upload one check-in photo as base64 JSON
  // Body: { check_in_id, positie ('front'|'side'|'back'), data_base64, mime? }
  if (pathname === '/api/klant/checkin-foto' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });

    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }

    const { check_in_id, positie, data_base64, mime } = body;
    if (!check_in_id || !positie || !data_base64) {
      return jsonRes(res, 400, { error: 'check_in_id, positie en data_base64 vereist' });
    }

    // Verify this check-in belongs to this klant (prevent cross-klant writes)
    const checkins = await supabaseHelper.listCheckIns(klant.id);
    const own = (checkins || []).some(c => c.id === check_in_id);
    if (!own) return jsonRes(res, 403, { error: 'Check-in niet van jou' });

    let buffer;
    try { buffer = Buffer.from(data_base64, 'base64'); }
    catch { return jsonRes(res, 400, { error: 'Ongeldige base64' }); }
    if (buffer.length > 8 * 1024 * 1024) {
      return jsonRes(res, 413, { error: 'Foto te groot (max 8 MB)' });
    }

    const result = await supabaseHelper.uploadCheckInFoto({
      klantId: klant.id,
      checkInId: check_in_id,
      positie,
      buffer,
      contentType: mime || 'image/jpeg',
    });
    if (!result.ok) return jsonRes(res, 400, { error: result.error });
    return jsonRes(res, 200, { ok: true, path: result.path });
  }

  // GET /api/admin/klanten/:klantId/checkins — admin: list check-ins for a klant (incl. fotos)
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/checkins$/i);
    if (m && req.method === 'GET') {
      if (!requireAuth(req, res)) return;
      const klantId = m[1];
      const rows = await supabaseHelper.listCheckIns(klantId);
      const enriched = await Promise.all((rows || []).map(async (ci) => {
        const fotos = await supabaseHelper.listCheckInFotos(klantId, ci.id);
        const withUrls = await Promise.all(fotos.map(async (f) => ({
          positie: f.positie,
          path: f.path,
          signed_url: await supabaseHelper.signCheckInFoto(f.path, 1800),
        })));
        return { ...ci, fotos: withUrls };
      }));
      return jsonRes(res, 200, { check_ins: enriched });
    }
  }

  // GET /api/klanten — admin list of klanten
  if (pathname === '/api/klanten' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const klanten = await supabaseHelper.listKlanten();
    return jsonRes(res, 200, klanten || []);
  }

  // =============================================================
  // TRAINING — templates + schema's per klant/week (Fase 2.4)
  // =============================================================

  // GET /api/admin/training-templates
  if (pathname === '/api/admin/training-templates' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const rows = await supabaseHelper.listTrainingTemplates();
    return jsonRes(res, 200, { templates: rows || [] });
  }

  // POST /api/admin/training-templates — create
  if (pathname === '/api/admin/training-templates' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const r = await supabaseHelper.saveTrainingTemplate(body);
    if (!r.ok) return jsonRes(res, 400, { error: r.error });
    return jsonRes(res, 200, { ok: true, template: r.template });
  }

  // PUT/DELETE /api/admin/training-templates/:id
  {
    const m = pathname.match(/^\/api\/admin\/training-templates\/([0-9a-f-]+)$/i);
    if (m) {
      if (!requireAuth(req, res)) return;
      const id = m[1];
      if (req.method === 'PUT') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
        const r = await supabaseHelper.saveTrainingTemplate({ ...body, id });
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true, template: r.template });
      }
      if (req.method === 'DELETE') {
        const r = await supabaseHelper.deleteTrainingTemplate(id);
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true });
      }
    }
  }

  // GET /api/admin/klanten/:klantId/training-schemas
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/training-schemas$/i);
    if (m && req.method === 'GET') {
      if (!requireAuth(req, res)) return;
      const rows = await supabaseHelper.listTrainingSchemas(m[1]);
      return jsonRes(res, 200, { schemas: rows || [] });
    }
  }

  // PUT/DELETE /api/admin/klanten/:klantId/training-schemas/:weekNr
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/training-schemas\/(\d+)$/i);
    if (m) {
      if (!requireAuth(req, res)) return;
      const klantId = m[1];
      const weekNr = parseInt(m[2], 10);
      if (req.method === 'PUT') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
        const r = await supabaseHelper.saveTrainingSchema({
          klantId, weekNr,
          titel: body.titel,
          content_markdown: body.content_markdown,
          template_id: body.template_id || null,
        });
        if (!r.ok) return jsonRes(res, 400, { error: r.error });

        // Notify klant if 'notify' flag is true (admin kiest zelf): email + push
        if (body.notify) {
          supabaseHelper.supabase
            .from('klanten').select('email,naam').eq('id', klantId).single()
            .then(({ data }) => {
              if (data?.email && emailHelper.isEnabled()) {
                emailHelper.sendKlantNewTrainingEmail({
                  to: data.email, klantNaam: data.naam, weekNr, titel: body.titel,
                }).catch(e => console.warn('[training mail] failed:', e.message));
              }
            }).catch(() => {});
          pushToKlant(klantId, {
            title: `🏋️ Training week ${weekNr} staat klaar`,
            body: body.titel ? String(body.titel).slice(0, 100) : 'Je nieuwe trainingsschema is beschikbaar.',
            url: '/klant/start#training',
            tag: 'training-' + klantId,
          }).catch(e => console.warn('[training push] failed:', e.message));
        }

        return jsonRes(res, 200, { ok: true, schema: r.schema });
      }
      if (req.method === 'DELETE') {
        const r = await supabaseHelper.deleteTrainingSchema(klantId, weekNr);
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true });
      }
    }
  }

  // GET /api/klant/training-schemas — klant leest eigen schemas (JWT)
  if (pathname === '/api/klant/training-schemas' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    const rows = await supabaseHelper.listTrainingSchemas(klant.id);
    return jsonRes(res, 200, { schemas: rows || [] });
  }

  // =============================================================
  // VOEDING — templates + plan per klant (Fase 2.4)
  // =============================================================

  // GET /api/admin/voeding-templates
  if (pathname === '/api/admin/voeding-templates' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const rows = await supabaseHelper.listVoedingTemplates();
    return jsonRes(res, 200, { templates: rows || [] });
  }

  // POST /api/admin/voeding-templates — create
  if (pathname === '/api/admin/voeding-templates' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const r = await supabaseHelper.saveVoedingTemplate(body);
    if (!r.ok) return jsonRes(res, 400, { error: r.error });
    return jsonRes(res, 200, { ok: true, template: r.template });
  }

  // PUT/DELETE /api/admin/voeding-templates/:id
  {
    const m = pathname.match(/^\/api\/admin\/voeding-templates\/([0-9a-f-]+)$/i);
    if (m) {
      if (!requireAuth(req, res)) return;
      const id = m[1];
      if (req.method === 'PUT') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
        const r = await supabaseHelper.saveVoedingTemplate({ ...body, id });
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true, template: r.template });
      }
      if (req.method === 'DELETE') {
        const r = await supabaseHelper.deleteVoedingTemplate(id);
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true });
      }
    }
  }

  // GET/PUT/DELETE /api/admin/klanten/:klantId/voeding-plan
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/voeding-plan$/i);
    if (m) {
      if (!requireAuth(req, res)) return;
      const klantId = m[1];
      if (req.method === 'GET') {
        const plan = await supabaseHelper.getVoedingPlan(klantId);
        return jsonRes(res, 200, { plan: plan || null });
      }
      if (req.method === 'PUT') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
        const r = await supabaseHelper.saveVoedingPlan({ ...body, klantId });
        if (!r.ok) return jsonRes(res, 400, { error: r.error });

        // Notify klant if 'notify' flag is true: email + push
        if (body.notify) {
          supabaseHelper.supabase
            .from('klanten').select('email,naam').eq('id', klantId).single()
            .then(({ data }) => {
              if (data?.email && emailHelper.isEnabled()) {
                emailHelper.sendKlantNewVoedingEmail({
                  to: data.email, klantNaam: data.naam,
                  titel: body.titel, calories: r.plan.calories,
                }).catch(e => console.warn('[voeding mail] failed:', e.message));
              }
            }).catch(() => {});
          pushToKlant(klantId, {
            title: '🥗 Voedingsplan bijgewerkt',
            body: body.titel ? String(body.titel).slice(0, 100) : 'Je nieuwe plan staat klaar.',
            url: '/klant/start#voeding',
            tag: 'voeding-' + klantId,
          }).catch(e => console.warn('[voeding push] failed:', e.message));
        }

        return jsonRes(res, 200, { ok: true, plan: r.plan });
      }
      if (req.method === 'DELETE') {
        const r = await supabaseHelper.deleteVoedingPlan(klantId);
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true });
      }
    }
  }

  // =============================================================
  // CHAT — klant ↔ coach (Fase 2.5)
  // =============================================================

  // GET /api/klant/chat — klant leest eigen chat (JWT)
  if (pathname === '/api/klant/chat' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    const messages = await supabaseHelper.listChatMessages(klant.id);
    const unread = await supabaseHelper.countUnreadForKlant(klant.id);
    return jsonRes(res, 200, { messages: messages || [], unread });
  }

  // POST /api/klant/chat — klant stuurt bericht (JWT)
  if (pathname === '/api/klant/chat' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const r = await supabaseHelper.sendChatMessage({
      klantId: klant.id, van: 'klant', content: body.content,
    });
    if (!r.ok) return jsonRes(res, 400, { error: r.error });

    // Notify coach by email — fire and forget
    if (emailHelper.isEnabled()) {
      emailHelper.sendCoachNewMessageEmail({
        klantNaam: klant.naam, klantEmail: klant.email, messagePreview: r.message.content,
      }).catch(e => console.warn('[chat->coach mail] failed:', e.message));
    }

    return jsonRes(res, 200, { ok: true, message: r.message });
  }

  // POST /api/klant/chat/read — klant markeert coach berichten als gelezen
  if (pathname === '/api/klant/chat/read' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    await supabaseHelper.markChatRead(klant.id, 'coach');
    return jsonRes(res, 200, { ok: true });
  }

  // POST /api/klant/push/subscribe — klant registreert device voor push
  if (pathname === '/api/klant/push/subscribe' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const { endpoint, keys } = body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return jsonRes(res, 400, { error: 'Ongeldige subscription' });
    }
    const result = await supabaseHelper.savePushSubscription({
      klantId: klant.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    });
    if (!result.ok) return jsonRes(res, 500, { error: result.error });
    return jsonRes(res, 200, { ok: true });
  }

  // POST /api/klant/push/unsubscribe — klant zet push uit
  if (pathname === '/api/klant/push/unsubscribe' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const { endpoint } = body || {};
    if (!endpoint) return jsonRes(res, 400, { error: 'Geen endpoint' });
    await supabaseHelper.deletePushSubscription(endpoint);
    return jsonRes(res, 200, { ok: true });
  }

  // GET /api/admin/klanten/:klantId/chat — coach leest chat van klant
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/chat$/i);
    if (m && req.method === 'GET') {
      if (!requireAuth(req, res)) return;
      const messages = await supabaseHelper.listChatMessages(m[1]);
      return jsonRes(res, 200, { messages: messages || [] });
    }
  }

  // POST /api/admin/klanten/:klantId/chat — coach stuurt bericht
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/chat$/i);
    if (m && req.method === 'POST') {
      if (!requireAuth(req, res)) return;
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
      const r = await supabaseHelper.sendChatMessage({
        klantId: m[1], van: 'coach', content: body.content,
      });
      if (!r.ok) return jsonRes(res, 400, { error: r.error });

      // Notify klant: email + push (fire-and-forget)
      supabaseHelper.supabase
        .from('klanten').select('email,naam').eq('id', m[1]).single()
        .then(({ data }) => {
          if (data?.email && emailHelper.isEnabled()) {
            emailHelper.sendKlantNewMessageEmail({
              to: data.email, klantNaam: data.naam, messagePreview: r.message.content,
            }).catch(e => console.warn('[chat->klant mail] failed:', e.message));
          }
        }).catch(e => console.warn('[chat->klant lookup] failed:', e.message));

      // Push notification naar klant (alle devices)
      pushToKlant(m[1], {
        title: '💬 Bericht van Julia',
        body: (r.message.content || '').slice(0, 120),
        url: '/klant/start#chat',
        tag: 'chat-' + m[1],
      }).catch(e => console.warn('[chat->push] failed:', e.message));

      return jsonRes(res, 200, { ok: true, message: r.message });
    }
  }

  // POST /api/admin/klanten/:klantId/chat/read — coach markeert klant berichten als gelezen
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/chat\/read$/i);
    if (m && req.method === 'POST') {
      if (!requireAuth(req, res)) return;
      await supabaseHelper.markChatRead(m[1], 'klant');
      return jsonRes(res, 200, { ok: true });
    }
  }

  // =============================================================
  // COACH NOTITIES (Fase 2.6 A) — privé aantekeningen per klant
  // =============================================================

  // GET /api/admin/klanten/:klantId/notities
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/notities$/i);
    if (m && req.method === 'GET') {
      if (!requireAuth(req, res)) return;
      const rows = await supabaseHelper.listCoachNotities(m[1]);
      return jsonRes(res, 200, { notities: rows || [] });
    }
  }

  // POST /api/admin/klanten/:klantId/notities — create new
  {
    const m = pathname.match(/^\/api\/admin\/klanten\/([0-9a-f-]+)\/notities$/i);
    if (m && req.method === 'POST') {
      if (!requireAuth(req, res)) return;
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
      const r = await supabaseHelper.saveCoachNotitie({ klantId: m[1], content: body.content });
      if (!r.ok) return jsonRes(res, 400, { error: r.error });
      return jsonRes(res, 200, { ok: true, notitie: r.notitie });
    }
  }

  // PUT/DELETE /api/admin/notities/:id
  {
    const m = pathname.match(/^\/api\/admin\/notities\/([0-9a-f-]+)$/i);
    if (m) {
      if (!requireAuth(req, res)) return;
      const id = m[1];
      if (req.method === 'PUT') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
        const r = await supabaseHelper.saveCoachNotitie({ id, content: body.content });
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true, notitie: r.notitie });
      }
      if (req.method === 'DELETE') {
        const r = await supabaseHelper.deleteCoachNotitie(id);
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true });
      }
    }
  }

  // =============================================================
  // VIDEOS (Fase 2.6 C) — video library
  // =============================================================

  // GET /api/admin/videos
  if (pathname === '/api/admin/videos' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const rows = await supabaseHelper.listVideos();
    return jsonRes(res, 200, { videos: rows || [] });
  }

  // POST /api/admin/videos
  if (pathname === '/api/admin/videos' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const r = await supabaseHelper.saveVideo(body);
    if (!r.ok) return jsonRes(res, 400, { error: r.error });
    return jsonRes(res, 200, { ok: true, video: r.video });
  }

  // PUT/DELETE /api/admin/videos/:id
  {
    const m = pathname.match(/^\/api\/admin\/videos\/([0-9a-f-]+)$/i);
    if (m) {
      if (!requireAuth(req, res)) return;
      const id = m[1];
      if (req.method === 'PUT') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
        const r = await supabaseHelper.saveVideo({ ...body, id });
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true, video: r.video });
      }
      if (req.method === 'DELETE') {
        const r = await supabaseHelper.deleteVideo(id);
        if (!r.ok) return jsonRes(res, 400, { error: r.error });
        return jsonRes(res, 200, { ok: true });
      }
    }
  }

  // GET /api/klant/videos — klant ziet alle video's (JWT)
  if (pathname === '/api/klant/videos' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const rows = await supabaseHelper.listVideos();
    return jsonRes(res, 200, { videos: rows || [] });
  }

  // =============================================================
  // ADMIN STATS (Fase 2.6 E)
  // =============================================================

  if (pathname === '/api/admin/stats/overview' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const stats = await supabaseHelper.getAdminStats();
    return jsonRes(res, 200, stats || {});
  }

  // GET /api/admin/stats/vandaag — actie-lijst voor de coach
  // (nieuwe check-ins, onbeantwoorde chats, training te plannen, geen check-in).
  if (pathname === '/api/admin/stats/vandaag' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const stats = await supabaseHelper.getVandaagStats();
    return jsonRes(res, 200, stats || { nieuweCheckIns: [], chatOnbeantwoord: [], trainingTePlannen: [], geenCheckIn10d: [], totaal: 0 });
  }

  // ===== COACH TO-DO LIST =====
  if (pathname === '/api/admin/todos' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const todos = await supabaseHelper.listCoachTodos();
    return jsonRes(res, 200, { todos });
  }
  if (pathname === '/api/admin/todos' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
    const r = await supabaseHelper.createCoachTodo({
      title: body.title,
      description: body.description,
      klantId: body.klant_id,
      dueDate: body.due_date,
      prioriteit: body.prioriteit,
    });
    if (!r.ok) return jsonRes(res, 400, { error: r.error });
    return jsonRes(res, 200, { ok: true, todo: r.todo });
  }
  {
    const m = pathname.match(/^\/api\/admin\/todos\/([0-9a-f-]+)$/i);
    if (m && req.method === 'PUT') {
      if (!requireAuth(req, res)) return;
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }
      const r = await supabaseHelper.updateCoachTodo(m[1], body);
      if (!r.ok) return jsonRes(res, 400, { error: r.error });
      return jsonRes(res, 200, { ok: true, todo: r.todo });
    }
    if (m && req.method === 'DELETE') {
      if (!requireAuth(req, res)) return;
      const r = await supabaseHelper.deleteCoachTodo(m[1]);
      if (!r.ok) return jsonRes(res, 400, { error: r.error });
      return jsonRes(res, 200, { ok: true });
    }
  }

  // POST /api/admin/reminders/run — handmatig de weekly check-in reminders draaien.
  // Alleen voor admin (Julia/Dorus) — om te testen of eenmalig te pushen.
  if (pathname === '/api/admin/reminders/run' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    // Niet synchroon wachten — fire-and-forget zodat de UI niet blokkeert.
    runWeeklyReminders().catch(e => console.warn('[Reminders] trigger faalde:', e.message));
    return jsonRes(res, 200, { ok: true, message: 'Reminders gestart op achtergrond. Check server logs.' });
  }

  // GET /api/admin/chat/unread — { klantId: count } map voor sidebar badges
  if (pathname === '/api/admin/chat/unread' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const counts = await supabaseHelper.countUnreadForCoach();
    return jsonRes(res, 200, { counts });
  }

  // GET /api/klant/voeding-plan — klant leest eigen voedingsplan (JWT)
  if (pathname === '/api/klant/voeding-plan' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = await supabaseHelper.verifyUserToken(token);
    if (!user) return jsonRes(res, 401, { error: 'Not logged in' });
    const klant = await supabaseHelper.getKlantByAuthUserId(user.id);
    if (!klant) return jsonRes(res, 404, { error: 'No klant profile found' });
    const plan = await supabaseHelper.getVoedingPlan(klant.id);
    return jsonRes(res, 200, { plan: plan || null });
  }

  // POST /api/admin/klanten — manually create a klant (for testing or for
  // clients who bought outside Plug&Pay). Creates auth user + klanten row
  // and returns a magic-link URL that can be copied/mailed to the client.
  if (pathname === '/api/admin/klanten' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    if (!supabaseHelper.isEnabled()) {
      return jsonRes(res, 503, { error: 'Supabase not configured' });
    }

    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }

    const email = (body.email || '').toLowerCase().trim();
    const naam = (body.naam || '').trim();
    const telefoon = body.telefoon ? String(body.telefoon).trim() : null;
    // Nieuwe flow: Julia kiest zelf een wachtwoord (of laat 'm auto-genereren).
    // Leeg → backend genereert een willekeurig wachtwoord van 10 tekens.
    let password = body.password ? String(body.password) : '';
    let password_generated = false;
    if (!password) {
      // 10 tekens uit alfanumeriek (kleine letters + cijfers — makkelijk voor
      // niet-tech klanten om over te typen). Crypto.randomBytes voor safety.
      const alph = 'abcdefghjkmnpqrstuvwxyz23456789'; // zonder i/l/o/0/1 — minder verwarrend
      const buf = crypto.randomBytes(10);
      password = Array.from(buf).map(b => alph[b % alph.length]).join('');
      password_generated = true;
    }
    if (password.length < 6) return jsonRes(res, 400, { error: 'Wachtwoord moet minstens 6 tekens zijn' });

    if (!email || !email.includes('@')) return jsonRes(res, 400, { error: 'Geldig email vereist' });
    if (!naam) return jsonRes(res, 400, { error: 'Naam vereist' });

    const auth = await supabaseHelper.createOrGetAuthUser(email, {
      metadata: { naam, source: 'admin_manual' },
      password,
    });
    if (!auth.ok) return jsonRes(res, 500, { error: 'Auth user: ' + auth.error });

    const klantRes = await supabaseHelper.createKlant({
      email, naam, telefoon, authUserId: auth.id,
    });
    if (!klantRes.ok) return jsonRes(res, 500, { error: 'Klant: ' + klantRes.error });

    // Welkomstmail — alleen als 'send_email' true is in body (Julia kiest zelf).
    // De mail bevat nu email + wachtwoord i.p.v. magic link, want Julia wilde
    // een gewone login-flow voor klanten.
    let email_sent = false;
    if (body.send_email && emailHelper.isEnabled()) {
      const siteOrigin = process.env.SITE_ORIGIN || `https://${CANONICAL_HOST}`;
      const mailRes = await emailHelper.sendWelcomeEmail({
        to: email, naam,
        loginUrl: siteOrigin + '/klant/login',
        email,
        password,
      });
      email_sent = mailRes.ok;
    }

    return jsonRes(res, 200, {
      ok: true,
      klant: klantRes.klant,
      auth_user_created: auth.created,
      password,               // Julia toont dit in de UI en kopieert / deelt
      password_generated,
      email_sent,
    });
  }

  // POST /api/admin/klanten/:klantId/set-password — Julia zet een nieuw wachtwoord
  // voor een bestaande klant (bijv. als klant 'm vergeten is).
  const setPwdMatch = pathname.match(/^\/api\/admin\/klanten\/([^\/]+)\/set-password$/);
  if (setPwdMatch && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    if (!supabaseHelper.isEnabled()) {
      return jsonRes(res, 503, { error: 'Supabase not configured' });
    }
    const klantId = setPwdMatch[1];
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return jsonRes(res, 400, { error: 'Invalid JSON' }); }

    let password = body.password ? String(body.password) : '';
    let password_generated = false;
    if (!password) {
      const alph = 'abcdefghjkmnpqrstuvwxyz23456789';
      const buf = crypto.randomBytes(10);
      password = Array.from(buf).map(b => alph[b % alph.length]).join('');
      password_generated = true;
    }
    if (password.length < 6) return jsonRes(res, 400, { error: 'Wachtwoord moet minstens 6 tekens zijn' });

    // Haal de klant op om het auth_user_id en email te vinden
    const klant = await supabaseHelper.getKlantById(klantId);
    if (!klant || !klant.auth_user_id) return jsonRes(res, 404, { error: 'Klant niet gevonden (of geen auth user gekoppeld)' });

    const up = await supabaseHelper.setPasswordForUser(klant.auth_user_id, password);
    if (!up.ok) return jsonRes(res, 500, { error: 'Wachtwoord setten mislukt: ' + up.error });

    return jsonRes(res, 200, { ok: true, password, password_generated, email: klant.email });
  }

  // ===== API ROUTES =====

  // GET /api/leads — all leads (admin only)
  // Prefers Supabase when available (canonical store going forward),
  // falls back to the file-based store.
  if (pathname === '/api/leads' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    if (supabaseHelper.isEnabled()) {
      const sbLeads = await supabaseHelper.listLeads();
      if (sbLeads) {
        // Map Supabase rows back to the shape the admin UI expects.
        const mapped = sbLeads.map(l => ({
          id: l.legacy_id || l.id,
          supabase_id: l.id,
          naam: l.naam,
          email: l.email,
          telefoon: l.telefoon,
          instagram: l.instagram,
          leeftijd: l.leeftijd,
          doel_type: l.doel_type,
          nummer_een_doel: l.nummer_een_doel,
          obstakel: l.obstakel,
          urgentie: l.urgentie,
          budget: l.budget,
          bereid: l.bereid,
          lang: l.lang,
          bron: l.bron,
          utm_source: l.utm_source,
          utm_medium: l.utm_medium,
          utm_campaign: l.utm_campaign,
          utm_content: l.utm_content,
          referrer: l.referrer,
          status: l.status,
          notities: l.notities_julia,
          timestamp: l.created_at,
        }));
        return jsonRes(res, 200, mapped);
      }
    }
    return jsonRes(res, 200, readLeads());
  }

  // POST /api/leads — create lead
  // Idempotent: re-POSTing the same lead.id (from client queue retry) is a no-op.
  // Every accepted lead is also appended to an append-only JSONL log as a
  // last-resort safety net against data loss.
  if (pathname === '/api/leads' && req.method === 'POST') {
    let lead;
    try {
      const body = await readBody(req);
      lead = JSON.parse(body);
    } catch (e) {
      return jsonRes(res, 400, { error: 'Invalid JSON: ' + e.message });
    }
    try {
      lead.id = lead.id || 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      lead.timestamp = lead.timestamp || new Date().toISOString();
      lead.status = lead.status || 'nieuw';

      // 1. Append to JSONL log FIRST — this file is never rewritten, so even if
      // the main leads.json write fails or state is lost, the lead survives.
      appendLeadLog(lead);

      // 2. Write to Supabase (primary store going forward).
      //    Non-blocking on failure — file-write below is the safety net.
      const sbResult = await supabaseHelper.saveLead(lead);
      if (!sbResult.ok) {
        console.warn('[POST /api/leads] Supabase write failed, file-only:', sbResult.error);
      }

      // 3. Write to file (legacy store — kept as fallback during migration).
      const leads = readLeads();
      if (leadExists(leads, lead.id)) {
        // Duplicate (client retry) — already persisted, treat as success
        return jsonRes(res, 200, { success: true, id: lead.id, duplicate: true });
      }
      leads.push(lead);
      writeLeads(leads);
      return jsonRes(res, 201, { success: true, id: lead.id, supabase: sbResult.ok });
    } catch (e) {
      console.error('[POST /api/leads] write error:', e.message);
      // Lead is already in the append-log + Supabase (if reachable) — file error
      // is not fatal. Return 500 so client retries, but data is safe.
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // DELETE /api/leads/:id — remove lead (both Supabase + file)
  if (pathname.startsWith('/api/leads/') && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    try {
      const leadId = decodeURIComponent(pathname.split('/').pop());

      // Delete from Supabase (non-blocking)
      if (supabaseHelper.isEnabled()) {
        const r = await supabaseHelper.deleteLead(leadId);
        if (!r.ok) console.warn('[DELETE lead] Supabase:', r.error);
      }

      // Delete from file (may miss leads that only live in Supabase — OK)
      const leads = readLeads();
      const idx = leads.findIndex(l => l.id === leadId);
      if (idx !== -1) {
        leads.splice(idx, 1);
        writeLeads(leads);
      }
      return jsonRes(res, 200, { success: true, id: leadId });
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // PUT /api/leads/:id — update lead (both Supabase + file)
  if (pathname.startsWith('/api/leads/') && req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    try {
      const leadId = decodeURIComponent(pathname.split('/').pop());
      const body = await readBody(req);
      const updates = JSON.parse(body);

      // Patch for Supabase — map legacy field names to schema columns
      const sbPatch = {};
      if (updates.naam !== undefined) sbPatch.naam = updates.naam;
      if (updates.email !== undefined) sbPatch.email = updates.email;
      if (updates.telefoon !== undefined) sbPatch.telefoon = updates.telefoon;
      if (updates.instagram !== undefined) sbPatch.instagram = updates.instagram;
      if (updates.status !== undefined) sbPatch.status = updates.status;
      if (updates.notities !== undefined) sbPatch.notities_julia = updates.notities;

      if (supabaseHelper.isEnabled() && Object.keys(sbPatch).length) {
        const r = await supabaseHelper.updateLead(leadId, sbPatch);
        if (!r.ok) console.warn('[PUT lead] Supabase:', r.error);
      }

      // Update file (legacy)
      const leads = readLeads();
      const idx = leads.findIndex(l => l.id === leadId);
      let updated = null;
      if (idx !== -1) {
        Object.assign(leads[idx], updates);
        writeLeads(leads);
        updated = leads[idx];
      }
      return jsonRes(res, 200, { success: true, lead: updated || { id: leadId, ...updates } });
    } catch (e) {
      return jsonRes(res, 400, { error: e.message });
    }
  }

  // GET /api/stats
  if (pathname === '/api/stats' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const leads = readLeads();
    const today = new Date().toISOString().slice(0, 10);
    return jsonRes(res, 200, {
      total: leads.length,
      nieuw: leads.filter(l => l.status === 'nieuw').length,
      gebeld: leads.filter(l => l.status === 'gebeld').length,
      afspraak: leads.filter(l => l.status === 'afspraak').length,
      klant: leads.filter(l => l.status === 'klant').length,
      lost: leads.filter(l => l.status === 'lost').length,
      urgent: leads.filter(l => parseInt(l.urgentie) >= 4).length,
      vandaag: leads.filter(l => l.timestamp && l.timestamp.startsWith(today)).length,
    });
  }

  // GET /api/tracking-config — tracking pixel IDs (public, read-only)
  if (pathname === '/api/tracking-config' && req.method === 'GET') {
    try { return jsonRes(res, 200, JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf-8'))); }
    catch { return jsonRes(res, 200, { ga4: '', metaPixel: '', tiktokPixel: '' }); }
  }

  // PUT /api/tracking-config — update tracking IDs from admin panel
  if (pathname === '/api/tracking-config' && req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    try {
      const body = await readBody(req);
      const cfg = JSON.parse(body);
      const clean = {
        ga4: String(cfg.ga4 || '').trim(),
        metaPixel: String(cfg.metaPixel || '').trim(),
        tiktokPixel: String(cfg.tiktokPixel || '').trim(),
      };
      fs.writeFileSync(TRACKING_FILE, JSON.stringify(clean, null, 2));
      return jsonRes(res, 200, { success: true, config: clean });
    } catch (e) { return jsonRes(res, 400, { error: e.message }); }
  }

  // GET /api/export/json — download all leads as JSON
  if (pathname === '/api/export/json' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const leads = readLeads();
    const today = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="julia-leads-${today}.json"`,
    });
    return res.end(JSON.stringify(leads, null, 2));
  }

  // GET /api/export/csv — download all leads as CSV (server-side)
  if (pathname === '/api/export/csv' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const leads = readLeads();
    const today = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="julia-leads-${today}.csv"`,
    });
    return res.end(leadsToCSV(leads));
  }

  // POST /api/backup/create — create on-demand timestamped backup
  if (pathname === '/api/backup/create' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    try {
      const leads = readLeads();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `leads-manual-${ts}.json`;
      fs.writeFileSync(path.join(BACKUP_DIR, filename), JSON.stringify(leads, null, 2));
      return jsonRes(res, 201, { success: true, file: filename, count: leads.length });
    } catch (e) { return jsonRes(res, 500, { error: e.message }); }
  }

  // GET /api/backup/list — list all backup files
  if (pathname === '/api/backup/list' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    return jsonRes(res, 200, listBackups());
  }

  // GET /api/backup/download?file=... — download a specific backup
  if (pathname === '/api/backup/download' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const file = parsed.query.file;
    if (!file || !/^[\w.-]+\.json$/.test(file)) {
      return jsonRes(res, 400, { error: 'Invalid file name' });
    }
    const fp = path.join(BACKUP_DIR, file);
    if (!fp.startsWith(BACKUP_DIR) || !fs.existsSync(fp)) {
      return jsonRes(res, 404, { error: 'Backup not found' });
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${file}"`,
    });
    return res.end(fs.readFileSync(fp));
  }

  // DELETE /api/backup/delete?file=... — remove a backup (user-initiated cleanup)
  if (pathname === '/api/backup/delete' && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    const file = parsed.query.file;
    if (!file || !/^[\w.-]+\.json$/.test(file)) {
      return jsonRes(res, 400, { error: 'Invalid file name' });
    }
    const fp = path.join(BACKUP_DIR, file);
    if (!fp.startsWith(BACKUP_DIR) || !fs.existsSync(fp)) {
      return jsonRes(res, 404, { error: 'Backup not found' });
    }
    fs.unlinkSync(fp);
    return jsonRes(res, 200, { success: true });
  }

  // POST /api/upload-hero — save hero image
  if (pathname === '/api/upload-hero' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    try {
      const body = await readBody(req);
      const { dataUrl } = JSON.parse(body);
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return jsonRes(res, 400, { error: 'Invalid image data' });
      }
      const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) return jsonRes(res, 400, { error: 'Invalid base64 format' });
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const imgDir = path.join(ROOT, 'img');
      if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
      fs.writeFileSync(path.join(imgDir, `julia-hero.${ext}`), buffer);
      fs.writeFileSync(path.join(imgDir, 'julia-team.jpg'), buffer);
      return jsonRes(res, 200, { success: true, path: '/img/julia-team.jpg' });
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // ===== STATIC FILE SERVING =====
  // Remap the un-guessable admin slug:
  //   - if logged in: serve admin.html (leads portal)
  //   - if not logged in: serve login.html (login form)
  const isAdminSlug =
    pathname === `/${ADMIN_SLUG}` ||
    pathname === `/${ADMIN_SLUG}/` ||
    pathname === `/${ADMIN_SLUG}.html`;

  // Coach dashboard is bereikbaar op twee URLs:
  //  - /coach of /coach/  → vriendelijke publieke URL (login-gated)
  //  - /COACH_SLUG        → oude secret-slug URL (backward compat + bookmarks)
  const isCoachSlug =
    pathname === '/coach' ||
    pathname === '/coach/' ||
    pathname === `/${COACH_SLUG}` ||
    pathname === `/${COACH_SLUG}/` ||
    pathname === `/${COACH_SLUG}.html`;

  // Klant routes — pretty URLs that map to real HTML files
  const klantRouteMap = {
    '/klant/login': '/klant-login.html',
    '/klant/login/': '/klant-login.html',
    '/klant/start': '/klant-start.html',
    '/klant/start/': '/klant-start.html',
    '/klant/intake': '/klant-intake.html',
    '/klant/intake/': '/klant-intake.html',
    '/klant/welkom': '/klant-welkom.html',
    '/klant/welkom/': '/klant-welkom.html',
    '/klant/checkin': '/klant-checkin.html',
    '/klant/checkin/': '/klant-checkin.html',
    '/klant/workout': '/klant-workout.html',
    '/klant/workout/': '/klant-workout.html',
    '/klant': '/klant-start.html',
    '/klant/': '/klant-start.html',
  };

  let filePath;
  if (isAdminSlug) {
    filePath = getSession(req) ? '/admin.html' : '/login.html';
  } else if (isCoachSlug) {
    filePath = getSession(req) ? '/coach.html' : '/login.html';
  } else if (klantRouteMap[pathname]) {
    filePath = klantRouteMap[pathname];
  } else {
    filePath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  }
  filePath = path.join(ROOT, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const tryPaths = [filePath];
  if (!path.extname(filePath)) tryPaths.push(filePath + '.html');

  function tryServe(paths) {
    if (paths.length === 0) {
      // SPA fallback: serve index.html for unknown routes
      const indexPath = path.join(ROOT, 'index.html');
      fs.readFile(indexPath, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not Found'); }
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
      return;
    }
    const p = paths[0];
    const ext = path.extname(p).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    fs.readFile(p, (err, data) => {
      if (err) return tryServe(paths.slice(1));
      const headers = { 'Content-Type': contentType };
      if (ext === '.html' || ext === '.js' || ext === '.css') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      // Gzip for large files
      const acceptGzip = (req.headers['accept-encoding'] || '').includes('gzip');
      if (acceptGzip && data.length > 10240) {
        zlib.gzip(data, (err2, compressed) => {
          if (err2) { res.writeHead(200, headers); return res.end(data); }
          headers['Content-Encoding'] = 'gzip';
          headers['Vary'] = 'Accept-Encoding';
          res.writeHead(200, headers);
          res.end(compressed);
        });
      } else {
        res.writeHead(200, headers);
        res.end(data);
      }
    });
  }

  tryServe(tryPaths);
});

server.listen(PORT, () => {
  console.log(`[Julia Besten] Server running on port ${PORT}`);
  console.log(`[Julia Besten] http://localhost:${PORT}`);
});

// =============================================================
// PUSH HELPER — stuur notificatie naar alle devices van 1 klant
// =============================================================
async function pushToKlant(klantId, payload) {
  if (!pushHelper.isEnabled()) return;
  const subs = await supabaseHelper.listPushSubscriptionsForKlant(klantId);
  if (!subs || !subs.length) return;
  for (const s of subs) {
    const subscription = {
      endpoint: s.endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    const r = await pushHelper.sendToSubscription(subscription, payload);
    if (r && r.gone) {
      // Subscription is dood — verwijderen uit DB om toekomstige failures te vermijden
      await supabaseHelper.deletePushSubscription(s.endpoint);
    }
  }
}

// =============================================================
// WEEKLY CHECK-IN REMINDER CRON
// =============================================================
// Elke zondag rond 18:00 (Europe/Amsterdam) krijgen actieve klanten die
// >= 4 dagen geen check-in deden een vriendelijke reminder-mail.
// Geen echte cron (Railway heeft die niet), dus we pollen elke 5 min en
// checken of het moment gepasseerd is. Een bestand in DATA_DIR houdt bij
// wanneer we 'm laatst succesvol draaiden, zodat herstart / 2e instance
// niet twee keer mailt.
// =============================================================

const REMINDER_MARKER = path.join(DATA_DIR, 'last-reminder-run.txt');
const REMINDER_DAY = 0; // 0 = zondag
const REMINDER_HOUR_LOCAL = 18; // 18:00 Europe/Amsterdam

function readReminderMarker() {
  try {
    if (!fs.existsSync(REMINDER_MARKER)) return 0;
    return parseInt(fs.readFileSync(REMINDER_MARKER, 'utf-8').trim(), 10) || 0;
  } catch { return 0; }
}

function writeReminderMarker(ts) {
  try { fs.writeFileSync(REMINDER_MARKER, String(ts)); } catch {}
}

function localHourInAmsterdam(date) {
  // Gebruik Intl om het uur in Amsterdam tijdzone te krijgen (DST-aware).
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: 'numeric', weekday: 'short', hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, day: dayMap[weekday] ?? -1 };
}

async function runWeeklyReminders() {
  if (!emailHelper.isEnabled()) {
    console.log('[Reminders] email not configured, skip.');
    return;
  }
  if (!supabaseHelper.isEnabled()) {
    console.log('[Reminders] Supabase not configured, skip.');
    return;
  }
  const klanten = await supabaseHelper.listKlantenMetLaatsteCheckIn();
  if (!klanten) {
    console.warn('[Reminders] kon klanten niet ophalen, skip.');
    return;
  }
  const nu = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const dagMs = 24 * 60 * 60 * 1000;
  let sent = 0;
  let skipped = 0;
  for (const k of klanten) {
    if (!k.email) { skipped++; continue; }
    const startTs = k.start_datum ? new Date(k.start_datum).getTime() : null;
    const weekNr = startTs ? Math.min(16, Math.max(1, Math.ceil((nu - startTs) / weekMs))) : 1;
    const lastTs = k.laatste_checkin_at ? new Date(k.laatste_checkin_at).getTime() : null;
    const daysSince = lastTs ? Math.floor((nu - lastTs) / dagMs) : null;
    // Alleen mailen als de klant meer dan 4 dagen geen check-in heeft.
    // (anders heeft ze deze week al ingecheckt, geen herinnering nodig)
    if (daysSince != null && daysSince < 4) { skipped++; continue; }
    try {
      await emailHelper.sendCheckInReminderEmail({
        to: k.email, naam: k.naam, weekNr, daysSinceLast: daysSince,
      });
      sent++;
    } catch (e) {
      console.warn('[Reminders] mail faalde voor', k.email, e.message);
    }
  }
  console.log(`[Reminders] verstuurd: ${sent}, overgeslagen: ${skipped}`);
}

async function checkReminderCron() {
  try {
    const now = new Date();
    const { hour, day } = localHourInAmsterdam(now);
    if (day !== REMINDER_DAY || hour < REMINDER_HOUR_LOCAL) return;
    const lastRun = readReminderMarker();
    // Al gestuurd binnen de laatste 20 uur? Skip (voorkomt dubbele mail bij restart).
    if (Date.now() - lastRun < 20 * 60 * 60 * 1000) return;
    console.log('[Reminders] zondagavond in Amsterdam, start mailronde...');
    writeReminderMarker(Date.now()); // meteen marker zetten — voorkomt dat 2 instances tegelijk mailen
    await runWeeklyReminders();
  } catch (e) {
    console.warn('[Reminders] cron-check error:', e.message);
  }
}

// Start cron-check na een kleine delay (zodat listen() eerst af is)
setTimeout(() => {
  checkReminderCron();
  setInterval(checkReminderCron, 5 * 60 * 1000); // elke 5 min
}, 30 * 1000);

// =============================================================
// DAILY HABIT REMINDER CRON
// =============================================================
// Elke avond ~20:00 Europe/Amsterdam krijgen actieve klanten die nog
// géén daily_habit rij voor vandaag hebben gevuld een korte push + mail.
// Zelfde markerbestand-patroon als weekly.
// =============================================================

const DAILY_REMINDER_MARKER = path.join(DATA_DIR, 'last-daily-reminder-run.txt');
const DAILY_REMINDER_HOUR_LOCAL = 20;

function readDailyMarker() {
  try {
    if (!fs.existsSync(DAILY_REMINDER_MARKER)) return 0;
    return parseInt(fs.readFileSync(DAILY_REMINDER_MARKER, 'utf-8').trim(), 10) || 0;
  } catch { return 0; }
}
function writeDailyMarker(ts) {
  try { fs.writeFileSync(DAILY_REMINDER_MARKER, String(ts)); } catch {}
}

async function runDailyHabitReminders() {
  if (!supabaseHelper.isEnabled()) { console.log('[DailyReminder] Supabase off'); return; }
  const klanten = await supabaseHelper.listKlantenMetLaatsteCheckIn();
  if (!klanten) { console.warn('[DailyReminder] klanten fetch failed'); return; }
  const vandaag = new Date().toISOString().slice(0, 10);
  let sent = 0; let skipped = 0;
  for (const k of klanten) {
    if (k.status !== 'actief') { skipped++; continue; } // alleen actieve klanten
    // Check of ze al een daily_habit rij hebben voor vandaag met iets ingevuld
    const habit = await supabaseHelper.getDailyHabit(k.id, vandaag);
    const hasAnything = habit && (
      habit.water_ok || habit.slaap_ok || habit.stappen_ok || habit.training_ok ||
      (habit.journal && habit.journal.trim().length > 0)
    );
    if (hasAnything) { skipped++; continue; }

    // Push naar alle devices (als push enabled + klant ge-subscribed)
    pushToKlant(k.id, {
      title: '☀️ Je dagelijkse check-in',
      body: 'Tik je 4 vakjes aan en schrijf 1 zin — 30 seconden werk.',
      url: '/klant/start',
      tag: 'daily-reminder-' + k.id,
    }).catch(() => {});

    // Mail — alleen als email geconfigureerd is
    if (k.email && emailHelper.isEnabled()) {
      try {
        await emailHelper.sendDailyHabitReminderEmail({ to: k.email, naam: k.naam });
        sent++;
      } catch (e) {
        console.warn('[DailyReminder] mail fail', k.email, e.message);
      }
    } else {
      sent++;
    }
  }
  console.log(`[DailyReminder] push/mail: ${sent}, skipped: ${skipped}`);
}

async function checkDailyReminderCron() {
  try {
    const now = new Date();
    const { hour } = localHourInAmsterdam(now);
    if (hour < DAILY_REMINDER_HOUR_LOCAL) return;
    const lastRun = readDailyMarker();
    // Al gedraaid in de afgelopen 18 uur? Skip (voorkomt dubbele push na restart)
    if (Date.now() - lastRun < 18 * 60 * 60 * 1000) return;
    console.log('[DailyReminder] avond in Amsterdam, start ronde...');
    writeDailyMarker(Date.now());
    await runDailyHabitReminders();
  } catch (e) {
    console.warn('[DailyReminder] cron-check error:', e.message);
  }
}

// Start de daily-check 35 sec na listen (iets na weekly)
setTimeout(() => {
  checkDailyReminderCron();
  setInterval(checkDailyReminderCron, 5 * 60 * 1000);
}, 35 * 1000);

// Handmatige trigger endpoint — voor testen of als Julia zelf wil pushen.
// Protected: alleen admin-session of X-Admin-Secret header.
const REMINDER_TRIGGER_SECRET = process.env.REMINDER_TRIGGER_SECRET || '';

// (Wordt opgepakt door de request handler hieronder via een extra hook.)
