// =============================================================
// Calendly API helper — leest scheduled events + invitees voor het
// Calls-portaal in de admin. Read-only; alleen data ophalen.
//
// Token via env CALENDLY_TOKEN (Personal Access Token). De organisatie- en
// user-URI's worden 1x gecached na de eerste /users/me call.
// =============================================================

const TOKEN = process.env.CALENDLY_TOKEN || '';
const BASE = 'https://api.calendly.com';

let _me = null; // { uri, organization, name, email, scheduling_url }
let _meFetchedAt = 0;

function isEnabled() { return !!TOKEN; }

async function api(pathOrUrl, { method = 'GET' } = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Calendly ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Huidige gebruiker + organisatie (30 min gecached).
async function getMe() {
  if (_me && Date.now() - _meFetchedAt < 30 * 60 * 1000) return _me;
  const { resource } = await api('/users/me');
  _me = {
    uri: resource.uri,
    organization: resource.current_organization,
    name: resource.name,
    email: resource.email,
    scheduling_url: resource.scheduling_url,
  };
  _meFetchedAt = Date.now();
  return _me;
}

// Alle scheduled events in een periode, alle statussen, gepagineerd.
// min/max zijn ISO-strings (of null). Loopt door tot alle pagina's binnen zijn.
async function listScheduledEvents({ minStart = null, maxStart = null, max = 1000 } = {}) {
  const me = await getMe();
  const params = new URLSearchParams({
    organization: me.organization,
    count: '100',
    sort: 'start_time:desc',
  });
  if (minStart) params.set('min_start_time', minStart);
  if (maxStart) params.set('max_start_time', maxStart);

  const events = [];
  let url = `/scheduled_events?${params.toString()}`;
  let guard = 0;
  while (url && events.length < max && guard < 50) {
    guard++;
    const data = await api(url);
    for (const e of (data.collection || [])) events.push(e);
    const token = data.pagination?.next_page_token;
    if (!token) break;
    const p = new URLSearchParams(params);
    p.set('page_token', token);
    url = `/scheduled_events?${p.toString()}`;
  }
  return events;
}

// Invitees van één event (meestal 1 voor 1-op-1 calls).
async function listInvitees(eventUri) {
  const data = await api(`${eventUri}/invitees?count=100`);
  return data.collection || [];
}

// Haal events + hun invitees samen op. Retourneert een platte lijst van
// "calls" (1 per invitee) met de velden die het portaal nodig heeft.
// Invitees worden parallel opgehaald maar in kleine batches (rate-limit vriendelijk).
async function listCalls({ minStart = null, maxStart = null } = {}) {
  const events = await listScheduledEvents({ minStart, maxStart });
  const calls = [];

  const BATCH = 8;
  for (let i = 0; i < events.length; i += BATCH) {
    const slice = events.slice(i, i + BATCH);
    const results = await Promise.all(slice.map(async (e) => {
      let invitees = [];
      try { invitees = await listInvitees(e.uri); } catch { invitees = []; }
      return { e, invitees };
    }));
    for (const { e, invitees } of results) {
      const eventId = (e.uri || '').split('/').pop();
      if (!invitees.length) {
        // Event zonder ophaalbare invitee — toch als call meetellen.
        calls.push({
          event_id: eventId,
          event_uri: e.uri,
          naam: null, email: null,
          start_time: e.start_time,
          end_time: e.end_time,
          event_naam: e.name,
          status: e.status,           // 'active' | 'canceled'
          no_show: false,
          canceled: e.status === 'canceled',
          cancel_reason: e.cancellation?.reason || null,
          created_at: e.created_at,
          utm_source: null,
        });
        continue;
      }
      for (const inv of invitees) {
        calls.push({
          event_id: eventId,
          event_uri: e.uri,
          invitee_uri: inv.uri,
          naam: inv.name || null,
          email: (inv.email || '').toLowerCase() || null,
          start_time: e.start_time,
          end_time: e.end_time,
          event_naam: e.name,
          status: e.status,
          no_show: !!inv.no_show,           // Calendly no_show object of null
          canceled: inv.status === 'canceled' || e.status === 'canceled',
          cancel_reason: inv.cancellation?.reason || e.cancellation?.reason || null,
          created_at: inv.created_at || e.created_at,
          utm_source: inv.tracking?.utm_source || null,
        });
      }
    }
  }
  return calls;
}

// ===== WEBHOOK SUBSCRIPTIONS =====
// Registreer een org-webhook die bij invitee.created / invitee.canceled naar
// onze server POST. Retourneert de subscription incl. signing_key (voor
// signature-verificatie van binnenkomende webhooks).
async function createWebhook(callbackUrl) {
  const me = await getMe();
  const res = await fetch(BASE + '/webhook_subscriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: callbackUrl,
      events: ['invitee.created', 'invitee.canceled'],
      organization: me.organization,
      scope: 'organization',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Calendly webhook create ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data.resource;
}

async function listWebhooks() {
  const me = await getMe();
  const params = new URLSearchParams({ organization: me.organization, scope: 'organization', count: '100' });
  const data = await api(`/webhook_subscriptions?${params.toString()}`);
  return data.collection || [];
}

module.exports = {
  isEnabled, getMe, listScheduledEvents, listInvitees, listCalls,
  createWebhook, listWebhooks,
};
