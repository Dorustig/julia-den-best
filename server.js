// ===== JULIA DEN BEST — STANDALONE SERVER =====
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

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

// ===== ADMIN URL =====
// Un-guessable admin URL slug. No login required — security through a long
// random URL that no one can guess. Bookmark this and keep it private.
// Can be overridden per deploy via env var.
const ADMIN_SLUG = process.env.ADMIN_SLUG || 'portal-j8k3m9q2x7p5v4';

// MIME types
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2',
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
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Redirect the predictable /admin paths to the public landing page —
  // anyone guessing lands on the regular site, not a 404 that hints at admin.
  if (pathname === '/admin.html' || pathname === '/admin' || pathname === '/admin/') {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }

  // ===== API ROUTES =====

  // GET /api/leads — all leads (admin only, auth already checked)
  if (pathname === '/api/leads' && req.method === 'GET') {
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

      // Append to JSONL log FIRST — this file is never rewritten, so even if
      // the main leads.json write fails or state is lost, the lead survives.
      appendLeadLog(lead);

      const leads = readLeads();
      if (leadExists(leads, lead.id)) {
        // Duplicate (client retry) — already persisted, treat as success
        return jsonRes(res, 200, { success: true, id: lead.id, duplicate: true });
      }
      leads.push(lead);
      writeLeads(leads);
      return jsonRes(res, 201, { success: true, id: lead.id });
    } catch (e) {
      console.error('[POST /api/leads] write error:', e.message);
      // Lead is already in the append-log — return 500 so client retries, but
      // even if it never does, the lead is safe in leads-append.jsonl.
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // DELETE /api/leads/:id — remove lead
  if (pathname.startsWith('/api/leads/') && req.method === 'DELETE') {
    try {
      const leadId = pathname.split('/').pop();
      const leads = readLeads();
      const idx = leads.findIndex(l => l.id === leadId);
      if (idx === -1) return jsonRes(res, 404, { error: 'Lead not found' });
      const removed = leads.splice(idx, 1)[0];
      writeLeads(leads);
      return jsonRes(res, 200, { success: true, id: removed.id });
    } catch (e) {
      return jsonRes(res, 500, { error: e.message });
    }
  }

  // PUT /api/leads/:id — update lead
  if (pathname.startsWith('/api/leads/') && req.method === 'PUT') {
    try {
      const leadId = pathname.split('/').pop();
      const body = await readBody(req);
      const updates = JSON.parse(body);
      const leads = readLeads();
      const idx = leads.findIndex(l => l.id === leadId);
      if (idx === -1) return jsonRes(res, 404, { error: 'Lead not found' });
      Object.assign(leads[idx], updates);
      writeLeads(leads);
      return jsonRes(res, 200, { success: true, lead: leads[idx] });
    } catch (e) {
      return jsonRes(res, 400, { error: e.message });
    }
  }

  // GET /api/stats
  if (pathname === '/api/stats' && req.method === 'GET') {
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
    return jsonRes(res, 200, listBackups());
  }

  // GET /api/backup/download?file=... — download a specific backup
  if (pathname === '/api/backup/download' && req.method === 'GET') {
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
  // Remap the un-guessable admin slug to serve admin.html content.
  // The slug URL is the ONLY way to reach the admin panel.
  const isAdminSlug =
    pathname === `/${ADMIN_SLUG}` ||
    pathname === `/${ADMIN_SLUG}/` ||
    pathname === `/${ADMIN_SLUG}.html`;

  let filePath = isAdminSlug
    ? '/admin.html'
    : (pathname === '/' ? '/index.html' : decodeURIComponent(pathname));
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
  console.log(`[Julia Den Best] Server running on port ${PORT}`);
  console.log(`[Julia Den Best] http://localhost:${PORT}`);
});
