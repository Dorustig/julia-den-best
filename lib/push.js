// =============================================================
// Julia Besten — Web Push (VAPID) helper
//
// Env vars (Railway + local .env):
//   VAPID_PUBLIC_KEY    base64url public key (shown to client)
//   VAPID_PRIVATE_KEY   base64url private key (server only)
//   VAPID_SUBJECT       mailto:your@email.nl
//
// Alle sends zijn fire-and-forget — een failing push blokkeert nooit de
// originele request. Dode subscriptions (410/404) worden teruggegeven
// zodat de caller ze uit de DB kan halen.
// =============================================================

let webpush = null;
let isEnabled = false;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:julia@juliabesten.nl';

try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush = require('web-push');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    isEnabled = true;
    console.log('[Push] enabled');
  } else {
    console.log('[Push] NOT CONFIGURED — set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY');
  }
} catch (e) {
  console.warn('[Push] init failed:', e.message);
}

/**
 * Stuur een push naar 1 subscription. Result is:
 *   { ok: true }                → delivered (of in queue)
 *   { ok: false, gone: true }   → subscription is expired/gone (410/404) — verwijder uit DB
 *   { ok: false, error: '...' } → andere error
 */
async function sendToSubscription(subscription, payload) {
  if (!isEnabled) return { ok: false, error: 'not configured' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const status = err.statusCode;
    if (status === 410 || status === 404) {
      return { ok: false, gone: true, error: 'subscription expired' };
    }
    return { ok: false, error: err.message };
  }
}

module.exports = {
  isEnabled: () => isEnabled,
  getPublicKey: () => VAPID_PUBLIC_KEY,
  sendToSubscription,
};
