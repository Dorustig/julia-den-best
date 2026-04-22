// ===== POLICY LOADER & MARKDOWN RENDERER =====
// Laadt een markdown bestand uit /policies/ en rendert het in <div id="policy-content">.
// De pagina moet een <meta name="policy-source" content="/policies/xxx.md"> hebben.

(function () {
  'use strict';

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Inline: bold (**text**), links ([text](url))
  function renderInline(text) {
    let t = escapeHtml(text);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return t;
  }

  function renderTable(lines) {
    const parseRow = (line) =>
      line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const header = parseRow(lines[0]);
    // lines[1] is the separator (|---|---|)
    const body = lines.slice(2).map(parseRow);
    let html = '<table><thead><tr>';
    html += header.map((h) => `<th>${renderInline(h)}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const row of body) {
      html += '<tr>' + row.map((c) => `<td>${renderInline(c)}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function renderMarkdown(md) {
    const lines = md.split(/\r?\n/);
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Blank line
      if (!line.trim()) { i++; continue; }

      // Heading
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        const level = h[1].length;
        out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
        i++;
        continue;
      }

      // Table (line starts with | and next line is separator)
      if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
        const tbl = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tbl.push(lines[i].trim());
          i++;
        }
        out.push(renderTable(tbl));
        continue;
      }

      // Unordered list
      if (/^\s*-\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*-\s+/, ''));
          i++;
        }
        out.push('<ul>' + items.map((it) => `<li>${renderInline(it)}</li>`).join('') + '</ul>');
        continue;
      }

      // Paragraph — consume following non-blank non-structural lines as one paragraph
      const para = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^#{1,6}\s+/.test(lines[i]) &&
        !/^\s*-\s+/.test(lines[i]) &&
        !lines[i].startsWith('|')
      ) {
        para.push(lines[i]);
        i++;
      }
      out.push(`<p>${renderInline(para.join(' '))}</p>`);
    }

    return out.join('\n');
  }

  async function loadPolicy() {
    const target = document.getElementById('policy-content');
    const meta = document.querySelector('meta[name="policy-source"]');
    if (!target || !meta) return;
    const src = meta.getAttribute('content');

    try {
      const res = await fetch(src, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const md = await res.text();
      target.innerHTML = renderMarkdown(md);

      // Set document title from the first H1 if present
      const firstH1 = md.match(/^#\s+(.+)$/m);
      if (firstH1 && !document.title.includes(firstH1[1])) {
        document.title = `${firstH1[1]} · Julia Besten`;
      }

      // Populate hero heading + meta (KVK + laatst bijgewerkt)
      const heroTitle = document.querySelector('.policy-hero h1');
      const heroMeta = document.querySelector('.policy-hero .policy-meta');
      if (heroTitle && firstH1) heroTitle.textContent = firstH1[1];
      if (heroMeta) {
        const kvk = md.match(/KVK-nummer:\s*(\S+)/);
        const updated = md.match(/Laatst bijgewerkt:\s*([^\n]+)/);
        const parts = [];
        if (kvk) parts.push(`KVK ${kvk[1]}`);
        if (updated) parts.push(`Laatst bijgewerkt: ${updated[1].trim()}`);
        heroMeta.textContent = parts.join(' · ');
      }
    } catch (err) {
      target.innerHTML = `<div class="policy-error">Kon dit document niet laden. Probeer het later opnieuw of mail info@juliabesten.nl.</div>`;
      console.error('[policy] load failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPolicy);
  } else {
    loadPolicy();
  }
})();
