// ===== JULIA DEN BEST — STANDALONE SERVER =====
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const PORT = process.env.PORT || 3001;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]');

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
function writeLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
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

  // ===== API ROUTES =====

  // GET /api/leads — all leads
  if (pathname === '/api/leads' && req.method === 'GET') {
    return jsonRes(res, 200, readLeads());
  }

  // POST /api/leads — create lead
  if (pathname === '/api/leads' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const lead = JSON.parse(body);
      lead.id = lead.id || 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      lead.timestamp = lead.timestamp || new Date().toISOString();
      lead.status = lead.status || 'nieuw';
      const leads = readLeads();
      leads.push(lead);
      writeLeads(leads);
      return jsonRes(res, 201, { success: true, id: lead.id });
    } catch (e) {
      return jsonRes(res, 400, { error: e.message });
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
  let filePath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
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
      if (ext === '.html' || ext === '.js') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
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
