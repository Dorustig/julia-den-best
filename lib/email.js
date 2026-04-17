// =============================================================
// Julia Besten — Email helpers (Fase 2.5b)
// Gmail SMTP via nodemailer.
//
// Env vars (set in Railway + local .env):
//   SMTP_HOST         default: smtp.gmail.com
//   SMTP_PORT         default: 465
//   SMTP_USER         your Gmail address (the account that sends)
//   SMTP_PASS         Gmail App Password (NOT your real Gmail password!)
//   FROM_EMAIL        shown as sender, e.g. julia@juliabesten.nl
//   FROM_NAME         display name, default "Julia Besten"
//   COACH_EMAIL       waar klant-berichten naartoe gaan (default = SMTP_USER)
//   SITE_ORIGIN       https://www.juliabesten.nl (used in email links)
//
// All sends are fire-and-forget — failures are logged, never thrown, never
// block the HTTP request that triggered them.
// =============================================================

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;
const FROM_NAME = process.env.FROM_NAME || 'Julia Besten';
const COACH_EMAIL = process.env.COACH_EMAIL || SMTP_USER;
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://www.juliabesten.nl';

let transporter = null;
let isEnabled = false;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  isEnabled = true;
  console.log(`[Email] enabled — ${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}`);
} else {
  console.log('[Email] NOT CONFIGURED — set SMTP_USER + SMTP_PASS env vars to enable');
}

// ---------- Layout helper ----------
// One consistent pink-on-cream shell. Keeps every mail feeling like the brand.
function layout({ title, bodyHtml, ctaText, ctaUrl, footerNote }) {
  return `<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#FDF2F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDF2F8;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;padding:36px 32px;box-shadow:0 8px 32px rgba(233,30,140,0.08);">
        <tr><td>
          <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;color:#E91E8C;font-weight:700;margin-bottom:4px;">Julia Besten</div>
          <div style="font-size:12px;color:#9CA3AF;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:24px;">1-op-1 Coaching</div>
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:26px;color:#1F2937;margin:0 0 20px;line-height:1.3;">${escapeHtml(title)}</h1>
          <div style="font-size:15px;line-height:1.6;color:#374151;">${bodyHtml}</div>
          ${ctaUrl ? `
            <div style="margin:28px 0 8px;text-align:center;">
              <a href="${ctaUrl}" style="display:inline-block;background:#E91E8C;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600;font-size:15px;">${escapeHtml(ctaText || 'Naar dashboard')}</a>
            </div>
          ` : ''}
          ${footerNote ? `<div style="margin-top:24px;font-size:12px;color:#9CA3AF;line-height:1.5;">${footerNote}</div>` : ''}
        </td></tr>
      </table>
      <div style="margin-top:20px;font-size:11px;color:#9CA3AF;">Julia Besten · ${SITE_ORIGIN.replace(/^https?:\/\//, '')}</div>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

// ---------- Core send ----------
async function sendMail({ to, subject, html, text, replyTo }) {
  if (!isEnabled) return { ok: false, error: 'email not configured' };
  if (!to) return { ok: false, error: 'to required' };
  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      text: text || stripHtml(html),
      html,
      replyTo: replyTo || FROM_EMAIL,
    });
    console.log(`[Email] → ${to} · ${subject} · ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.warn('[Email] send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Event-specific emails ----------

/**
 * Welkomstmail na Plug&Pay-aankoop / admin-aanmaken.
 *
 * Twee modi (backward compat):
 *  - magicLink: oude flow — 1-klik login link (werkt nog steeds als 'ie wordt meegegeven)
 *  - email + password: nieuwe flow — klant logt in met email + wachtwoord
 *
 * Als Julia een wachtwoord heeft ingesteld gebruiken we de tweede modus.
 */
async function sendWelcomeEmail({ to, naam, magicLink, loginUrl, email, password }) {
  const firstName = (naam || '').split(' ')[0] || 'daar';

  // --- modus: email + wachtwoord ---
  if (email && password) {
    const body = `
      <p>Hoi ${escapeHtml(firstName)},</p>
      <p>Welkom bij mijn 16-weken coachingtraject — ik heb super veel zin om samen aan de slag te gaan! 🌸</p>
      <p>Je inloggegevens voor je dashboard:</p>
      <div style="background:#FDF2F8;border:1px solid #F9A8D4;border-radius:12px;padding:16px 20px;margin:16px 0;font-family:'SF Mono',Menlo,monospace;font-size:14px;color:#831843;line-height:1.8;">
        <div><strong>E-mail:</strong> ${escapeHtml(email)}</div>
        <div><strong>Wachtwoord:</strong> ${escapeHtml(password)}</div>
      </div>
      <p>Op je dashboard vul je eerst de intake in. Vanaf dat moment draait alles door: wekelijkse check-ins, je trainingsschema, voedingsplan en we houden korte lijntjes via de chat.</p>
      <p style="font-size:13px;color:#6B7280;">Tip: verander je wachtwoord zodra je ingelogd bent — of laat hem zo. Kies zelf.</p>
    `;
    return sendMail({
      to,
      subject: 'Welkom bij Julia Besten — je inloggegevens',
      html: layout({
        title: 'Welkom! Tijd om te beginnen 💫',
        bodyHtml: body,
        ctaText: 'Log in op je dashboard',
        ctaUrl: loginUrl || `${SITE_ORIGIN}/klant/login`,
        footerNote: 'Bewaar deze mail veilig — hier staan je login-gegevens in.',
      }),
    });
  }

  // --- modus: magic link (oude fallback) ---
  const body = `
    <p>Hoi ${escapeHtml(firstName)},</p>
    <p>Welkom bij mijn 16-weken coachingtraject — ik heb super veel zin om samen aan de slag te gaan! 🌸</p>
    <p>Via onderstaande knop log je direct in op je eigen dashboard. Daar vul je eerst de intake in en vanaf dat moment draait alles door: wekelijkse check-ins, jouw trainingsschema, voedingsplan en we houden korte lijntjes via de chat.</p>
    <p style="font-size:13px;color:#6B7280;">De link hieronder werkt 1 uur. Daarna vraag je gewoon een nieuwe aan via de inlogpagina.</p>
  `;
  return sendMail({
    to,
    subject: 'Welkom bij Julia Besten — log in en begin je traject',
    html: layout({
      title: 'Welkom! Tijd om te beginnen 💫',
      bodyHtml: body,
      ctaText: 'Log in op je dashboard',
      ctaUrl: magicLink,
      footerNote: 'Niet gevraagd? Negeer deze mail gewoon — dan gebeurt er niks.',
    }),
  });
}

/**
 * Wachtwoord-reset mail: Julia heeft een nieuw wachtwoord gezet voor de klant.
 * We sturen de klant een mail met de nieuwe credentials.
 */
async function sendPasswordResetEmail({ to, naam, email, password, loginUrl }) {
  const firstName = (naam || '').split(' ')[0] || 'daar';
  const body = `
    <p>Hoi ${escapeHtml(firstName)},</p>
    <p>Je wachtwoord is opnieuw ingesteld door Julia. Hier zijn je nieuwe inloggegevens:</p>
    <div style="background:#FDF2F8;border:1px solid #F9A8D4;border-radius:12px;padding:16px 20px;margin:16px 0;font-family:'SF Mono',Menlo,monospace;font-size:14px;color:#831843;line-height:1.8;">
      <div><strong>E-mail:</strong> ${escapeHtml(email)}</div>
      <div><strong>Nieuw wachtwoord:</strong> ${escapeHtml(password)}</div>
    </div>
    <p>Log hiermee in op je dashboard. Je kunt het wachtwoord daarna zelf wijzigen als je wilt.</p>
  `;
  return sendMail({
    to,
    subject: 'Nieuw wachtwoord voor je Julia Besten dashboard',
    html: layout({
      title: 'Je wachtwoord is bijgewerkt',
      bodyHtml: body,
      ctaText: 'Log in',
      ctaUrl: loginUrl || `${SITE_ORIGIN}/klant/login`,
      footerNote: 'Heb je deze reset niet aangevraagd? Neem even contact op met Julia.',
    }),
  });
}

/**
 * Klant krijgt melding als Julia een bericht stuurt.
 * Preview van het bericht, CTA terug naar dashboard.
 */
async function sendKlantNewMessageEmail({ to, klantNaam, messagePreview }) {
  const firstName = (klantNaam || '').split(' ')[0] || 'daar';
  const preview = String(messagePreview || '').slice(0, 300);
  const body = `
    <p>Hoi ${escapeHtml(firstName)},</p>
    <p>Julia heeft je een bericht gestuurd:</p>
    <div style="background:#FDF2F8;border-left:3px solid #E91E8C;padding:14px 18px;border-radius:8px;margin:16px 0;font-style:italic;color:#831843;white-space:pre-wrap;">${escapeHtml(preview)}${messagePreview.length > 300 ? '…' : ''}</div>
    <p>Open de chat op je dashboard om te antwoorden.</p>
  `;
  return sendMail({
    to,
    subject: '💬 Nieuw bericht van Julia',
    html: layout({
      title: 'Julia heeft je een bericht gestuurd',
      bodyHtml: body,
      ctaText: 'Open chat',
      ctaUrl: `${SITE_ORIGIN}/klant/start`,
    }),
  });
}

/**
 * Coach (Julia) krijgt melding als klant een bericht stuurt.
 * Naar COACH_EMAIL. Reply-to is de klant zodat Julia direct kan antwoorden
 * vanuit haar inbox als ze dat wil.
 */
async function sendCoachNewMessageEmail({ klantNaam, klantEmail, messagePreview }) {
  if (!COACH_EMAIL) return { ok: false, error: 'no COACH_EMAIL configured' };
  const preview = String(messagePreview || '').slice(0, 400);
  const body = `
    <p>${escapeHtml(klantNaam || klantEmail)} heeft je een bericht gestuurd:</p>
    <div style="background:#F3F4F6;border-left:3px solid #6B7280;padding:14px 18px;border-radius:8px;margin:16px 0;white-space:pre-wrap;">${escapeHtml(preview)}${messagePreview.length > 400 ? '…' : ''}</div>
    <p style="font-size:13px;color:#6B7280;">Reageer via je admin-panel zodat het bericht ook in de klant-chat komt.</p>
  `;
  return sendMail({
    to: COACH_EMAIL,
    replyTo: klantEmail,
    subject: `💬 ${klantNaam || klantEmail} stuurde je een bericht`,
    html: layout({
      title: `Nieuw bericht van ${escapeHtml(klantNaam || klantEmail)}`,
      bodyHtml: body,
      ctaText: 'Open admin-chat',
      ctaUrl: `${SITE_ORIGIN}/`, // admin slug is geheim — linkje naar home, Julia weet de rest
    }),
  });
}

/**
 * Klant krijgt melding als Julia een nieuw trainingsschema plaatst voor een week.
 */
async function sendKlantNewTrainingEmail({ to, klantNaam, weekNr, titel }) {
  const firstName = (klantNaam || '').split(' ')[0] || 'daar';
  const body = `
    <p>Hoi ${escapeHtml(firstName)},</p>
    <p>Julia heeft je trainingsschema voor <strong>week ${weekNr}</strong>${titel ? ` — <em>${escapeHtml(titel)}</em>` : ''} klaargezet! 🏋️</p>
    <p>Open je dashboard en check de oefeningen, sets en reps.</p>
  `;
  return sendMail({
    to,
    subject: `🏋️ Je trainingsschema voor week ${weekNr} staat klaar`,
    html: layout({
      title: `Training week ${weekNr} staat klaar`,
      bodyHtml: body,
      ctaText: 'Bekijk schema',
      ctaUrl: `${SITE_ORIGIN}/klant/start`,
    }),
  });
}

/**
 * Klant krijgt melding als Julia een nieuw voedingsplan plaatst / updatet.
 */
async function sendKlantNewVoedingEmail({ to, klantNaam, titel, calories }) {
  const firstName = (klantNaam || '').split(' ')[0] || 'daar';
  const body = `
    <p>Hoi ${escapeHtml(firstName)},</p>
    <p>Je hebt een nieuw voedingsplan${titel ? `: <strong>${escapeHtml(titel)}</strong>` : ''}${calories ? ` (${calories} kcal)` : ''} van Julia. 🥗</p>
    <p>Open je dashboard voor de macro's en maaltijden.</p>
  `;
  return sendMail({
    to,
    subject: '🥗 Je voedingsplan is bijgewerkt',
    html: layout({
      title: 'Voedingsplan bijgewerkt',
      bodyHtml: body,
      ctaText: 'Bekijk plan',
      ctaUrl: `${SITE_ORIGIN}/klant/start`,
    }),
  });
}

module.exports = {
  isEnabled: () => isEnabled,
  sendMail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendKlantNewMessageEmail,
  sendCoachNewMessageEmail,
  sendKlantNewTrainingEmail,
  sendKlantNewVoedingEmail,
};
