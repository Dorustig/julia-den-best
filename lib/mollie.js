// =============================================================
// Mollie API helper — leest betalingen voor het betalingsoverzicht en
// de activity-feed. Read-only; we halen alleen data op.
//
// Token via env MOLLIE_API_KEY (live_... of test_...).
// =============================================================

const TOKEN = process.env.MOLLIE_API_KEY || '';
const BASE = 'https://api.mollie.com/v2';

function isEnabled() { return !!TOKEN; }

async function api(pathOrUrl) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + TOKEN },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Mollie ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Normaliseer 1 payment naar de velden die wij tonen.
function normalize(p) {
  const amt = p.amount || {};
  return {
    id: p.id,
    status: p.status,                       // 'paid' | 'open' | 'expired' | 'failed' | 'canceled' | 'pending'
    amount: parseFloat(amt.value || '0'),
    currency: amt.currency || 'EUR',
    description: p.description || '',
    method: p.method || null,
    consumer_name: p.details?.consumerName || null,
    created_at: p.createdAt || null,
    paid_at: p.paidAt || null,
    sequence_type: p.sequenceType || null,  // 'oneoff' | 'first' | 'recurring'
    refunded: parseFloat(p.amountRefunded?.value || '0'),
  };
}

// Haal payments op, nieuwste eerst, gepagineerd tot `max` of tot een payment
// ouder dan `sinceIso` (voor incrementeel pollen). Retourneert genormaliseerd.
async function listPayments({ max = 250, sinceIso = null } = {}) {
  const out = [];
  let url = `/payments?limit=250`;
  let guard = 0;
  while (url && out.length < max && guard < 20) {
    guard++;
    const data = await api(url);
    const rows = data._embedded?.payments || [];
    let stop = false;
    for (const p of rows) {
      if (sinceIso && p.createdAt && p.createdAt <= sinceIso) { stop = true; break; }
      out.push(normalize(p));
    }
    if (stop) break;
    const next = data._links?.next?.href;
    url = next || null;
  }
  return out;
}

// Alleen betaalde payments die na `sinceIso` betaald zijn (voor de activity-feed).
async function listNewPaid(sinceIso) {
  // We pakken ruim recente payments en filteren op paid_at > sinceIso.
  const all = await listPayments({ max: 250 });
  return all.filter(p => p.status === 'paid' && p.paid_at && (!sinceIso || p.paid_at > sinceIso));
}

module.exports = { isEnabled, listPayments, listNewPaid, normalize };
