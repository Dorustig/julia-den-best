// ===== JULIA DEN BEST — QUIZ + DATA + TRANSLATIONS + PHOTO =====

const TOTAL_STEPS = 8;
let currentStep = 1;
let currentLang = localStorage.getItem('julia_lang') || 'nl';

// ===== UTM / traffic-source capture =====
// Saves the first-touch attribution so even if user returns via direct link,
// we still know the original source that brought them in.
(function captureUTM() {
    try {
        const params = new URLSearchParams(window.location.search);
        const utm = {
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
            utm_content: params.get('utm_content') || '',
            utm_term: params.get('utm_term') || '',
            referrer: document.referrer || '',
            landing_at: new Date().toISOString()
        };
        // Only save first-touch — don't overwrite
        if (!localStorage.getItem('julia_attribution')) {
            localStorage.setItem('julia_attribution', JSON.stringify(utm));
        }
    } catch (e) {}
})();

function getAttribution() {
    try { return JSON.parse(localStorage.getItem('julia_attribution') || '{}'); }
    catch { return {}; }
}

// ===== FORM PROGRESS SAVE =====
// Per-device localStorage so visitors can pick up where they left off.
// Does NOT leak state to other visitors (unlike the earlier scroll bug).
function saveProgress() {
    try {
        const data = {};
        form.querySelectorAll('input, textarea').forEach(el => {
            if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
            else if (el.value) data[el.name] = el.value;
        });
        localStorage.setItem('julia_form_progress', JSON.stringify({ step: currentStep, data, savedAt: Date.now() }));
    } catch (e) {}
}
function restoreProgress() {
    try {
        const raw = localStorage.getItem('julia_form_progress');
        if (!raw) return;
        const saved = JSON.parse(raw);
        // Expire after 7 days
        if (Date.now() - (saved.savedAt || 0) > 7 * 24 * 3600 * 1000) {
            localStorage.removeItem('julia_form_progress');
            return;
        }
        Object.entries(saved.data || {}).forEach(([name, value]) => {
            const fields = form.querySelectorAll(`[name="${name}"]`);
            fields.forEach(el => {
                if (el.type === 'radio') { if (el.value === value) el.checked = true; }
                else el.value = value;
            });
        });
    } catch (e) {}
}
function clearProgress() {
    try { localStorage.removeItem('julia_form_progress'); } catch (e) {}
}

const form = document.getElementById('quizForm');
const btnVolgende = document.getElementById('btnVolgende');
const btnVorige = document.getElementById('btnVorige');
const btnVerstuur = document.getElementById('btnVerstuur');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// ===== TRANSLATIONS =====
const T = {
    nl: {
        // Navbar
        navCta: 'Start Nu',
        // Hero
        heroBadge: 'Nog maar 5 plekken beschikbaar deze maand',
        heroTitle: 'Girll, jij verdient <span class="highlight">écht</span> een transformatie.',
        heroSubtitle: 'Of je wil <strong>afvallen</strong>, je <strong>billen laten aankomen</strong> of <strong>gespierd aankomen</strong>. Ik help elke vrouw in Nederland, beginner of gevorderd. <strong>Je krijgt persoonlijke 1-op-1 begeleiding, een plan op maat en ik sta elke dag voor je klaar.</strong> Tijd om je eindelijk lekker in je lichaam te voelen. ✨',
        usp1: '100% persoonlijke begeleiding',
        usp2: '1-op-1 persoonlijke coaching',
        usp3: 'Op maat gemaakt voor jouw lichaam',
        heroCta: 'Ja, ik wil dit! Start mijn transformatie',
        heroGuarantee: 'Niet goed? Geld terug. Geen risico.',
        stat1: 'Vrouwen geholpen', stat2: 'Beoordeling',
        float1name: 'Emma', float1text: 'Net week 8 afgerond!',
        float2name: '-7kg in 16 weken', float2text: 'Gemiddeld resultaat',
        dropzone: 'Sleep hier je foto naartoe<br><small>of klik om te uploaden</small>',
        // Empathy
        empathyTitle: 'Herken je dit?',
        pain1: 'Je hebt al 10 dieten geprobeerd maar niks werkt',
        pain2: 'Je krijgt standaard schema\'s of copy-paste plannen zonder persoonlijk contact',
        pain3: 'Je mag bijna niks eten en voelt je ellendig',
        pain4: 'Je coach reageert pas na 3 dagen (of helemaal niet)',
        pain5: 'Je voelt je alleen en hebt niemand die je begrijpt',
        pain6: 'Je weet niet waar je moet beginnen of wat echt werkt',
        empathyDivider: 'Ik sta zelf voor je klaar',
        gain1: 'Ik maak een persoonlijk plan dat bij jou past',
        gain2: 'Ik sta zelf voor je klaar, elke dag',
        gain3: 'Je eet lekker en ziet toch resultaat',
        gain4: 'Je krijgt een community van vrouwen die je begrijpen',
        gain5: 'Ik bouw samen met jou een duurzaam resultaat',
        gain6: 'Niet tevreden? Je krijgt je geld volledig terug',
        // Guarantee
        guaranteeTitle: '100% Niet-Goed-Geld-Terug Garantie',
        guaranteeText: 'Ik geloof zó sterk in mijn programma dat je je geld volledig terugkrijgt als je niet tevreden bent. Geen kleine lettertjes, geen gedoe. Jouw resultaat is mijn missie.',
        // Quiz
        quizTitle: 'Ontdek jouw persoonlijke plan',
        quizSubtitle: 'Beantwoord een paar vragen zodat ik je het beste kan helpen',
        stepOf: 'Stap {n} van 8',
        q1: 'Hoe kan ik je het beste helpen?',
        q1a: 'Afvallen', q1b: 'Spiermassa opbouwen', q1c: 'Gezonde levensstijl', q1d: 'Lichaamstransformatie',
        q2: 'Wat is jouw leeftijd?',
        q2a: '16 tot 17 jaar', q2b: '18 tot 25 jaar', q2c: '25 tot 35 jaar', q2d: '35+ jaar',
        q3: 'Wat is je absolute nummer 1 doel op het gebied van fitness en gezondheid?',
        q3ph: 'Vertel hier over je belangrijkste doel...',
        q4: 'Wat staat je momenteel het meeste in de weg om dit doel te bereiken?',
        q4sub: 'Waarom heb je je doel nog niet behaald?',
        q4ph: 'Wat houdt je tegen...',
        q5: 'Hoe belangrijk is het voor jou om dit nu aan te pakken?',
        s1: 'Helemaal niet belangrijk', s1d: 'Ik vind mijn doelen nu niet belangrijk genoeg om er iets mee te doen.',
        s2: 'Niet zo belangrijk', s2d: 'Ik wil wel verandering maken, maar heb nu geen prioriteit voor.',
        s3: 'Neutraal', s3d: 'Ik twijfel nog. Ik wil iets doen, maar heb er geen duidelijke urgentie voor.',
        s4: 'Belangrijk', s4d: 'Ik wil serieus aan de slag en zoek hulp om mijn doelen te behalen.',
        s5: 'Zeer belangrijk', s5d: 'Absolute prioriteit. Ik wil nu verandering. Ben gemotiveerd om direct te starten.',
        q6: 'Stel je zou nu in jezelf investeren, wat zou voor jou per week realistisch voelen?',
        q6a: '€0 tot €40 per week', q6b: '€45 tot €70 per week', q6c: '€70 tot €100 per week', q6d: 'Geen idee, dat hoor ik graag in het gesprek',
        q7: 'Ben je bereid om tijd en geld te investeren om je transformatie waar te maken?',
        q7title: 'Ja, ik ben er klaar voor!',
        q7text: 'Ik wil investeren in mezelf en mijn gezondheid. Laten we dit samen doen!',
        q7btn: 'Ja! Ik wil starten',
        q8: 'Laatste stap: jouw contactgegevens',
        q8sub: 'Vul je gegevens in zodat ik persoonlijk contact met je kan opnemen',
        labelNaam: 'Volledige naam', phNaam: 'Je voor- en achternaam',
        labelEmail: 'E-mailadres', phEmail: 'naam@voorbeeld.nl',
        labelTel: 'Telefoonnummer', phTel: '06-12345678',
        labelIg: 'Hoe heet je op Instagram?', phIg: '@jouwnaam',
        btnPrev: 'Vorige', btnNext: 'Volgende',
        btnSubmit: 'Verstuur & Start Jouw Transformatie',
        trust1: '100% niet-goed-geld-terug garantie',
        trust2: 'Gratis kennismakingsgesprek',
        trust3: 'Persoonlijk contact met mij',
        // Reviews
        reviewsTitle: 'Wat andere vrouwen zeggen',
        // Transformations
        transTitle: 'Van A naar Z, echte transformaties',
        transSub: 'Bekijk wat onze klanten hebben bereikt met het 16-weken programma',
        // Community
        communityBadge: 'Word Onderdeel',
        communityTitle: 'Meer dan een programma, een <span class="highlight">community</span>',
        communityText: 'Als je bij mij start word je direct onderdeel van een exclusieve community van vrouwen die dezelfde reis maken als jij. Via onze Discord server deel je ervaringen, vier je successen en steun je elkaar op de moeilijke dagen.',
        comPerk1: 'Exclusieve Discord community alleen voor deelnemers',
        comPerk2: 'Dagelijkse motivatie en support van mij en de groep',
        comPerk3: 'Deel je progressie, recepten en tips met andere vrouwen',
        comPerk4: 'Je staat er nooit alleen voor, altijd iemand die je begrijpt',
        comCta: 'Ik wil erbij!',
        comCount: '50+ vrouwen zijn je al voorgegaan',
        // Program
        progBadge: '★ Elite',
        progTitle: 'Het Elite Programma',
        progSub: '6 maanden premium met 2 fysieke gym-dagen, 24/7 WhatsApp en ~14 persoonlijke sessies.',
        featTitle: 'Wat je krijgt',
        // CTA
        ctaTitle: 'Dit is jouw moment.',
        ctaText: 'Stop met twijfelen. Stop met uitstellen. Start vandaag nog met jouw transformatie.',
        ctaCta: 'Start nu, het is gratis',
        ctaGuarantee: 'Niet goed? Geld terug. Geen risico.',
        // Testimonials
        testTitle: 'Onze klanten aan het woord',
        // Modal (bijna klaar)
        modalBadge: 'Gelukt!',
        modalTitle: 'Bijna klaar, girll! ✨',
        modalSub: 'Je hebt het formulier ingevuld. Nog één klein stapje en jouw traject gaat echt beginnen.',
        modalReminderStrong: 'Herinnering: houd je SMS en WhatsApp in de gaten',
        modalReminderSpan: 'of geef hier je beschikbaarheid alvast door.',
        modalCTA: 'Stuur beschikbaarheid',
        modalDisclaimer: '* Als je het ons niet laat weten, nemen wij binnen 1 uur contact met je op met een vaste datum en tijd.',
        modalDivider: 'Bekijk daarna de korte video voor de volgende stap',
        modalVideoTitle: 'Julia legt uit wat er nu gebeurt',
        modalVideoSub: 'Korte video · klik om te bekijken',
        avTitle: 'Wanneer komt het jou uit?',
        avDaysLabel: 'Welke dagen?',
        avTijdvakLabel: 'Voorkeur tijdvak',
        avNotesLabel: 'Opmerkingen (optioneel)',
        avNotesPh: 'Bijv. liever na 19:00',
        avSubmit: 'Versturen',
        avSuccessStrong: 'Top, ik heb je beschikbaarheid ontvangen!',
        avSuccessSpan: 'Ik neem snel contact op.',
    },
    en: {
        navCta: 'Start Now',
        heroBadge: 'Only 5 spots left this month',
        heroTitle: 'Girll, you <span class="highlight">truly</span> deserve a transformation.',
        heroSubtitle: 'I help every woman, whether you\'re just starting or already experienced. <strong>With me you get personal 1-on-1 coaching, a plan tailored to you and I\'m there for you every day.</strong> Time to finally feel at home in your body. ✨',
        usp1: '100% personal coaching',
        usp2: '1-on-1 personal coaching',
        usp3: 'Tailored to your body',
        heroCta: 'Yes, I want this! Start my transformation',
        heroGuarantee: 'Not satisfied? Money back. No risk.',
        stat1: 'Women helped', stat2: 'Rating',
        float1name: 'Emma', float1text: 'Just completed week 8!',
        float2name: '-7kg in 16 weeks', float2text: 'Average result',
        dropzone: 'Drag your photo here<br><small>or click to upload</small>',
        empathyTitle: 'Sound familiar?',
        pain1: "You've tried 10 diets and nothing works",
        pain2: 'You get standard plans or copy-paste programs without personal contact',
        pain3: "You can barely eat anything and feel miserable",
        pain4: 'Your coach responds after 3 days (or not at all)',
        pain5: "You feel alone and have no one who understands you",
        pain6: "You don't know where to start or what actually works",
        empathyDivider: "I'm there for you myself",
        gain1: 'I make a personal plan that fits you',
        gain2: "I'm there for you myself, every day",
        gain3: 'You eat well and still see results',
        gain4: 'You get a community of women who understand you',
        gain5: 'I build sustainable results with you',
        gain6: 'Not satisfied? You get your money back in full',
        guaranteeTitle: '100% Money-Back Guarantee',
        guaranteeText: "I believe so strongly in my program that you get a full refund if you're not satisfied. No fine print, no hassle. Your result is my mission.",
        quizTitle: 'Discover your personal plan',
        quizSubtitle: 'Answer a few questions so I can help you best',
        stepOf: 'Step {n} of 8',
        q1: 'How can I help you best?',
        q1a: 'Lose weight', q1b: 'Build muscle', q1c: 'Healthy lifestyle', q1d: 'Body transformation',
        q2: 'What is your age?',
        q2a: '16 to 17 years', q2b: '18 to 25 years', q2c: '25 to 35 years', q2d: '35+ years',
        q3: 'What is your absolute #1 goal regarding fitness and health?',
        q3ph: 'Tell us about your most important goal...',
        q4: 'What is currently standing in your way the most?',
        q4sub: "Why haven't you reached your goal yet?",
        q4ph: 'What holds you back...',
        q5: 'How important is it for you to tackle this now?',
        s1: 'Not important at all', s1d: "I don't find my goals important enough to act on right now.",
        s2: 'Not very important', s2d: "I want to change, but it's not a priority right now.",
        s3: 'Neutral', s3d: "I'm still hesitating. I want to do something, but have no clear urgency.",
        s4: 'Important', s4d: 'I want to get serious and am looking for help to reach my goals.',
        s5: 'Very important', s5d: "Absolute priority. I want change now. I'm motivated to start immediately.",
        q6: 'If you were to invest in yourself, what would feel realistic per week?',
        q6a: '€0 to €40 per week', q6b: '€45 to €70 per week', q6c: '€70 to €100 per week', q6d: "Not sure, I'd like to discuss in the call",
        q7: 'Are you willing to invest time and money to make your transformation happen?',
        q7title: "Yes, I'm ready!",
        q7text: 'I want to invest in myself and my health. Let\'s do this together!',
        q7btn: 'Yes! I want to start',
        q8: 'Last step: your contact details',
        q8sub: 'Fill in your details so I can personally reach out to you',
        labelNaam: 'Full name', phNaam: 'Your first and last name',
        labelEmail: 'Email address', phEmail: 'name@example.com',
        labelTel: 'Phone number', phTel: '+31 6 12345678',
        labelIg: 'What is your Instagram name?', phIg: '@yourname',
        btnPrev: 'Previous', btnNext: 'Next',
        btnSubmit: 'Submit & Start Your Transformation',
        trust1: '100% money-back guarantee',
        trust2: 'Free introduction call',
        trust3: 'Personal contact with me',
        reviewsTitle: 'What other women say',
        transTitle: 'From A to Z, real transformations',
        transSub: 'See what our clients have achieved with the 16-week program',
        communityBadge: 'Join Us',
        communityTitle: 'More than a program, a <span class="highlight">community</span>',
        communityText: 'When you start with me you immediately become part of an exclusive community of women making the same journey as you. Through our Discord server you share experiences, celebrate wins and support each other on the tough days.',
        comPerk1: 'Exclusive Discord community for participants only',
        comPerk2: 'Daily motivation and support from me and the group',
        comPerk3: 'Share your progress, recipes and tips with other women',
        comPerk4: "You're never alone, always someone who understands you",
        comCta: 'I want to join!',
        comCount: '50+ women have gone before you',
        progBadge: '★ Elite',
        progTitle: 'The Elite Program',
        progSub: '6 months premium with 2 in-person gym days, 24/7 WhatsApp and ~14 personal sessions.',
        featTitle: 'What you get',
        ctaTitle: 'This is your moment.',
        ctaText: 'Stop doubting. Stop postponing. Start your transformation today.',
        ctaCta: 'Start now, it\'s free',
        ctaGuarantee: 'Not satisfied? Money back. No risk.',
        testTitle: 'Our clients speak',
        modalBadge: 'Success!',
        modalTitle: 'Almost done, girll! ✨',
        modalSub: 'You submitted the form. One tiny step to go and your journey truly begins.',
        modalReminderStrong: 'Reminder: keep an eye on your SMS and WhatsApp',
        modalReminderSpan: 'or share your availability below.',
        modalCTA: 'Share availability',
        modalDisclaimer: "* If you don't let us know, we'll contact you within 1 hour with a fixed date and time.",
        modalDivider: 'Afterwards, watch the short video for the next step',
        modalVideoTitle: 'Julia explains what happens next',
        modalVideoSub: 'Short video · click to watch',
        avTitle: 'When works for you?',
        avDaysLabel: 'Which days?',
        avTijdvakLabel: 'Preferred time',
        avNotesLabel: 'Notes (optional)',
        avNotesPh: 'E.g. preferably after 19:00',
        avSubmit: 'Send',
        avSuccessStrong: 'Got it, your availability is received!',
        avSuccessSpan: "I'll be in touch soon.",
    }
};

// Map: CSS selector → translation key (for textContent or innerHTML)
const TRANSLATION_MAP = [
    // Navbar
    { sel: '.nav-right .btn', key: 'navCta' },
    // Hero
    { sel: '.hero-badge', key: 'heroBadge', prepend: '<span class="badge-dot"></span> ' },
    { sel: '.hero h1', key: 'heroTitle', html: true },
    { sel: '.hero-subtitle', key: 'heroSubtitle', html: true },
    { sel: '.usp-item:nth-child(1)', key: 'usp1', keepSvg: true },
    { sel: '.usp-item:nth-child(2)', key: 'usp2', keepSvg: true },
    { sel: '.usp-item:nth-child(3)', key: 'usp3', keepSvg: true },
    { sel: '.hero-cta-group .btn-hero', key: 'heroCta' },
    { sel: '.hero-guarantee span', key: 'heroGuarantee' },
    { sel: '.stat:nth-child(1) .stat-label', key: 'stat1' },
    { sel: '.stat:nth-child(2) .stat-label', key: 'stat2' },
    { sel: '.float-card-1 strong', key: 'float1name' },
    { sel: '.float-card-1 span:last-child', key: 'float1text' },
    { sel: '.float-card-2 strong', key: 'float2name' },
    { sel: '.float-card-2 span:last-child', key: 'float2text' },
    { sel: '.dropzone-content p', key: 'dropzone', html: true },
    // Empathy
    { sel: '.empathy-card h2', key: 'empathyTitle' },
    { sel: '.empathy-item.negative:nth-child(1) p', key: 'pain1' },
    { sel: '.empathy-item.negative:nth-child(2) p', key: 'pain2' },
    { sel: '.empathy-item.negative:nth-child(3) p', key: 'pain3' },
    { sel: '.empathy-item.negative:nth-child(4) p', key: 'pain4' },
    { sel: '.empathy-item.negative:nth-child(5) p', key: 'pain5' },
    { sel: '.empathy-item.negative:nth-child(6) p', key: 'pain6' },
    { sel: '.empathy-divider span', key: 'empathyDivider' },
    { sel: '.empathy-item.positive:nth-child(1) p', key: 'gain1' },
    { sel: '.empathy-item.positive:nth-child(2) p', key: 'gain2' },
    { sel: '.empathy-item.positive:nth-child(3) p', key: 'gain3' },
    { sel: '.empathy-item.positive:nth-child(4) p', key: 'gain4' },
    { sel: '.empathy-item.positive:nth-child(5) p', key: 'gain5' },
    { sel: '.empathy-item.positive:nth-child(6) p', key: 'gain6' },
    // Guarantee
    { sel: '.guarantee-content h3', key: 'guaranteeTitle' },
    { sel: '.guarantee-content p', key: 'guaranteeText' },
    // Quiz header
    { sel: '.quiz-header h2', key: 'quizTitle' },
    { sel: '.quiz-header > p', key: 'quizSubtitle' },
    // Quiz questions
    { sel: '[data-step="1"] h3', key: 'q1' },
    { sel: '[data-step="2"] h3', key: 'q2' },
    { sel: '[data-step="3"] h3', key: 'q3' },
    { sel: '[data-step="4"] h3', key: 'q4' },
    { sel: '[data-step="4"] .step-subtitle', key: 'q4sub' },
    { sel: '[data-step="5"] h3', key: 'q5' },
    { sel: '[data-step="6"] h3', key: 'q6' },
    { sel: '[data-step="7"] h3', key: 'q7' },
    { sel: '.commitment-card h4', key: 'q7title' },
    { sel: '.commitment-card > p', key: 'q7text' },
    { sel: '[data-step="8"] h3', key: 'q8' },
    { sel: '[data-step="8"] .step-subtitle', key: 'q8sub' },
    // Quiz buttons
    { sel: '#btnVorige', key: 'btnPrev' },
    { sel: '#btnVolgende', key: 'btnNext' },
    { sel: '#btnVerstuur', key: 'btnSubmit' },
    // Trust
    { sel: '.quiz-trust-item:nth-child(1) span', key: 'trust1' },
    { sel: '.quiz-trust-item:nth-child(2) span', key: 'trust2' },
    { sel: '.quiz-trust-item:nth-child(3) span', key: 'trust3' },
    // Reviews
    { sel: '.reviews-section h2', key: 'reviewsTitle' },
    // Transformations
    { sel: '.transformations-section h2', key: 'transTitle' },
    { sel: '.transformations-section .section-subtitle', key: 'transSub' },
    // Community
    { sel: '.community-text .program-badge', key: 'communityBadge' },
    { sel: '.community-text h2', key: 'communityTitle', html: true },
    { sel: '.community-text > p', key: 'communityText' },
    { sel: '.community-perks li:nth-child(1)', key: 'comPerk1', keepSvg: true },
    { sel: '.community-perks li:nth-child(2)', key: 'comPerk2', keepSvg: true },
    { sel: '.community-perks li:nth-child(3)', key: 'comPerk3', keepSvg: true },
    { sel: '.community-perks li:nth-child(4)', key: 'comPerk4', keepSvg: true },
    { sel: '.community-text .btn', key: 'comCta' },
    { sel: '.community-count', key: 'comCount' },
    // Program
    { sel: '.program-header .program-badge', key: 'progBadge' },
    { sel: '.program-header h2', key: 'progTitle' },
    { sel: '.program-header .section-subtitle', key: 'progSub' },
    { sel: '.program-features h3', key: 'featTitle' },
    // CTA
    { sel: '.cta-section h2', key: 'ctaTitle' },
    { sel: '.cta-section > .container > p', key: 'ctaText' },
    { sel: '.cta-section .btn-hero', key: 'ctaCta' },
    { sel: '.cta-guarantee span', key: 'ctaGuarantee' },
    // Testimonials
    { sel: '.testimonials-section h2', key: 'testTitle' },
    // Modal
    // Bijna klaar modal
    { sel: '.almost-done-badge span', key: 'modalBadge' },
    { sel: '.almost-done-title', key: 'modalTitle' },
    { sel: '.almost-done-sub', key: 'modalSub' },
    { sel: '.reminder-text strong', key: 'modalReminderStrong' },
    { sel: '.reminder-text span', key: 'modalReminderSpan' },
    { sel: '#beschikbaarheidBtn', key: 'modalCTA' },
    { sel: '.success-disclaimer', key: 'modalDisclaimer' },
    { sel: '.almost-done-divider span', key: 'modalDivider' },
    { sel: '.video-caption strong', key: 'modalVideoTitle' },
    { sel: '.video-caption > span', key: 'modalVideoSub' },
    { sel: '.availability-form h3', key: 'avTitle' },
    { sel: '.availability-form .av-field:nth-of-type(1) .av-field-label', key: 'avDaysLabel' },
    { sel: '.availability-form .av-field:nth-of-type(2) .av-field-label', key: 'avTijdvakLabel' },
    { sel: '.availability-form .av-field:nth-of-type(3) .av-field-label', key: 'avNotesLabel' },
    { sel: '#avSubmitBtn', key: 'avSubmit' },
    { sel: '#avSuccess strong', key: 'avSuccessStrong' },
    { sel: '#avSuccess > span:last-of-type', key: 'avSuccessSpan' },
];

function applyTranslations(lang) {
    const t = T[lang];
    if (!t) return;

    TRANSLATION_MAP.forEach(({ sel, key, html, prepend, keepSvg }) => {
        const el = document.querySelector(sel);
        if (!el || !t[key]) return;

        if (keepSvg) {
            const svg = el.querySelector('svg');
            if (html) el.innerHTML = (svg ? svg.outerHTML + ' ' : '') + t[key];
            else el.innerHTML = (svg ? svg.outerHTML + ' ' : '') + t[key];
        } else if (html || prepend) {
            el.innerHTML = (prepend || '') + t[key];
        } else {
            el.textContent = t[key];
        }
    });

    // Quiz option cards (special handling)
    const optionMaps = [
        { step: 1, keys: ['q1a','q1b','q1c','q1d'] },
        { step: 2, keys: ['q2a','q2b','q2c','q2d'] },
        { step: 6, keys: ['q6a','q6b','q6c','q6d'] },
    ];
    optionMaps.forEach(({ step, keys }) => {
        const cards = document.querySelectorAll(`[data-step="${step}"] .option-text`);
        cards.forEach((card, i) => { if (t[keys[i]]) card.textContent = t[keys[i]]; });
    });

    // Scale labels
    for (let i = 1; i <= 5; i++) {
        const card = document.querySelectorAll('.scale-card')[i - 1];
        if (card) {
            const label = card.querySelector('.scale-label');
            const desc = card.querySelector('.scale-desc');
            if (label && t[`s${i}`]) label.textContent = t[`s${i}`];
            if (desc && t[`s${i}d`]) desc.textContent = t[`s${i}d`];
        }
    }

    // Textareas
    const ta3 = document.querySelector('[data-step="3"] textarea');
    if (ta3) ta3.placeholder = t.q3ph;
    const ta4 = document.querySelector('[data-step="4"] textarea');
    if (ta4) ta4.placeholder = t.q4ph;

    // Form labels & placeholders
    const formMap = [
        { id: 'naam', label: 'labelNaam', ph: 'phNaam' },
        { id: 'email', label: 'labelEmail', ph: 'phEmail' },
        { id: 'telefoon', label: 'labelTel', ph: 'phTel' },
        { id: 'instagram', label: 'labelIg', ph: 'phIg' },
    ];
    formMap.forEach(({ id, label, ph }) => {
        const input = document.getElementById(id);
        if (input) {
            input.placeholder = t[ph];
            const lbl = input.previousElementSibling;
            if (lbl && lbl.tagName === 'LABEL') lbl.textContent = t[label];
        }
    });

    // Commitment btn
    const comBtn = document.querySelector('.btn-commitment');
    if (comBtn) {
        const inp = comBtn.querySelector('input');
        comBtn.innerHTML = '';
        if (inp) comBtn.appendChild(inp);
        comBtn.appendChild(document.createTextNode(t.q7btn));
    }

    // Progress text
    updateProgressText(lang);

    // HTML lang attribute
    document.documentElement.lang = lang;
}

function updateProgressText(lang) {
    const t = T[lang || currentLang];
    if (progressText && t) {
        progressText.textContent = t.stepOf.replace('{n}', currentStep);
    }
}

// ===== LANGUAGE SWITCH =====
document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        currentLang = lang;
        localStorage.setItem('julia_lang', lang);
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyTranslations(lang);
    });
});

// ===== HERO PHOTO UPLOAD =====
function setupHeroPhoto() {
    const dropzone = document.getElementById('heroDropzone');
    const fileInput = document.getElementById('heroFileInput');
    const img = document.getElementById('heroImg');
    const wrapper = document.getElementById('heroImgWrapper');

    if (!dropzone) return;

    // Check if photo saved in localStorage
    const savedPhoto = localStorage.getItem('julia_hero_photo');
    if (savedPhoto) {
        img.src = savedPhoto;
        img.style.display = 'block';
        wrapper.style.display = '';
        dropzone.style.display = 'none';
    }

    // Click to upload
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag and drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-active');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-active'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-active');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadHeroImage(file);
    });

    // File input
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadHeroImage(file);
    });

    function loadHeroImage(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target.result;
            img.src = dataUrl;
            img.style.display = 'block';
            wrapper.style.display = '';
            dropzone.style.display = 'none';
            // Save to server
            try {
                await fetch('/api/upload-hero', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl })
                });
                // Reload img from server path
                img.src = '/img/julia-team.jpg?t=' + Date.now();
            } catch (err) {
                console.warn('Server upload failed, keeping local:', err);
            }
            // Also save locally as backup
            try { localStorage.setItem('julia_hero_photo', dataUrl); } catch(err) {
                console.warn('Photo too large for localStorage');
            }
        };
        reader.readAsDataURL(file);
    }
}

// ===== QUIZ NAVIGATION =====
function showStep(step, scroll = true) {
    // Clamp step to valid range
    if (step < 1) step = 1;
    if (step > TOTAL_STEPS) step = TOTAL_STEPS;
    currentStep = step;

    document.querySelectorAll('.quiz-step').forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.quiz-step[data-step="${step}"]`);
    if (target) target.classList.add('active');

    progressFill.style.width = `${(step / TOTAL_STEPS) * 100}%`;
    updateProgressText();

    btnVorige.style.display = step > 1 ? 'inline-flex' : 'none';
    btnVolgende.style.display = step < TOTAL_STEPS ? 'inline-flex' : 'none';
    btnVerstuur.style.display = step === TOTAL_STEPS ? 'inline-flex' : 'none';

    if (scroll) {
        document.getElementById('vragenlijst').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Save progress + fire tracking event
    saveProgress();
    if (window.__trackEvent) window.__trackEvent('quiz_step_view', { step });
}

function validateCurrentStep() {
    const step = document.querySelector(`.quiz-step[data-step="${currentStep}"]`);
    if (!step) return true;

    const radios = step.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
        const name = radios[0].name;
        if (!step.querySelector(`input[name="${name}"]:checked`)) {
            step.style.animation = 'none';
            step.offsetHeight;
            step.style.animation = 'shake 0.4s ease';
            return false;
        }
    }

    const textareas = step.querySelectorAll('textarea[required]');
    for (const ta of textareas) {
        if (!ta.value.trim()) { showFieldError(ta, 'Vul dit veld in'); return false; }
    }

    const inputs = step.querySelectorAll('input[type="text"][required], input[type="email"][required], input[type="tel"][required]');
    for (const input of inputs) {
        if (!input.value.trim()) { showFieldError(input, 'Vul dit veld in'); return false; }
        clearFieldError(input);
    }

    const emailInput = step.querySelector('input[type="email"]');
    if (emailInput && emailInput.value) {
        const emailCheck = validateEmail(emailInput.value);
        if (!emailCheck.ok) { showFieldError(emailInput, emailCheck.msg); return false; }
        clearFieldError(emailInput);
    }

    const telInput = step.querySelector('input[type="tel"]');
    if (telInput && telInput.value) {
        const phoneCheck = validateNLPhone(telInput.value);
        if (!phoneCheck.ok) { showFieldError(telInput, phoneCheck.msg); return false; }
        telInput.value = phoneCheck.normalized;
        clearFieldError(telInput);
    }

    return true;
}

// ===== FIELD VALIDATION HELPERS =====
function showFieldError(input, msg) {
    input.style.borderColor = '#E91E8C';
    let err = input.parentElement.querySelector('.field-error');
    if (!err) {
        err = document.createElement('div');
        err.className = 'field-error';
        input.parentElement.appendChild(err);
    }
    err.textContent = msg;
    input.focus();
}
function clearFieldError(input) {
    input.style.borderColor = '';
    const err = input.parentElement.querySelector('.field-error');
    if (err) err.remove();
}
function validateEmail(value) {
    const v = value.trim().toLowerCase();
    // Strict format: local@domain.tld with valid chars, at least 2-letter TLD
    const re = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
    if (!re.test(v)) return { ok: false, msg: 'Vul een geldig e-mailadres in' };
    // Block obvious fake / test domains
    const blockedDomains = ['test.com','test.nl','example.com','example.nl','example.org','asdf.com','aaa.com','fake.com','mail.com'];
    const domain = v.split('@')[1];
    if (blockedDomains.includes(domain)) return { ok: false, msg: 'Dit e-mailadres lijkt niet echt. Vul je echte mail in.' };
    // Block local parts that are too short or obviously fake (a@x.nl, aa@x.nl, test@, asdf@, qwerty@)
    const local = v.split('@')[0];
    if (local.length < 2) return { ok: false, msg: 'Vul je echte e-mailadres in' };
    if (['test','asdf','qwerty','abcd','aaaa','xxxx','noreply','no-reply'].includes(local)) {
        return { ok: false, msg: 'Vul je echte e-mailadres in' };
    }
    return { ok: true, normalized: v };
}
function validateNLPhone(value) {
    // Strip everything that's not a digit or leading +
    let digits = String(value).replace(/[\s\-\.\(\)]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    if (!/^\d+$/.test(digits)) return { ok: false, msg: 'Alleen cijfers toegestaan' };

    // Normalise to 06XXXXXXXX (10 digits)
    let normalized = null;
    if (/^06\d{8}$/.test(digits)) normalized = digits;
    else if (/^316\d{8}$/.test(digits)) normalized = '0' + digits.slice(2);
    else if (/^00316\d{8}$/.test(digits)) normalized = '0' + digits.slice(4);
    else if (/^6\d{8}$/.test(digits)) normalized = '0' + digits;

    if (!normalized) return { ok: false, msg: 'Vul een geldig 06-nummer in (bijv. 06-12345678)' };

    // Reject obvious fakes
    const suffix = normalized.slice(2); // 8 digits after 06
    // All same digit: 0611111111, 0600000000
    if (/^(\d)\1{7}$/.test(suffix)) return { ok: false, msg: 'Dit nummer lijkt niet echt. Vul je echte 06-nummer in.' };
    // Sequential ascending (12345678) or descending (87654321)
    if (suffix === '12345678' || suffix === '87654321' || suffix === '01234567' || suffix === '23456789') {
        return { ok: false, msg: 'Dit nummer lijkt niet echt. Vul je echte 06-nummer in.' };
    }
    // Display-friendly format: 06-12345678
    const pretty = '06-' + suffix;
    return { ok: true, normalized: pretty };
}

// Auto-advance
document.querySelectorAll('.option-card input[type="radio"], .scale-card input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
        const stepNum = parseInt(radio.closest('.quiz-step').dataset.step);
        if (stepNum === 7 || stepNum === 5) return;
        setTimeout(() => { if (currentStep < TOTAL_STEPS) { currentStep++; showStep(currentStep); } }, 300);
    });
});

document.querySelector('.btn-commitment')?.addEventListener('click', () => {
    setTimeout(() => {
        if (currentStep === 7 && currentStep < TOTAL_STEPS) {
            currentStep++;
            showStep(currentStep);
        }
    }, 300);
});

btnVolgende.addEventListener('click', () => {
    if (!validateCurrentStep()) return;
    if (currentStep < TOTAL_STEPS) { currentStep++; showStep(currentStep); }
});

btnVorige.addEventListener('click', () => {
    if (currentStep > 1) { currentStep--; showStep(currentStep); }
});

// ===== FORM SUBMISSION =====
btnVerstuur.addEventListener('click', async () => {
    if (!validateCurrentStep()) return;

    const formData = new FormData(form);
    const attribution = getAttribution();
    const lead = {
        id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        timestamp: new Date().toISOString(),
        doel_type: formData.get('doel_type'),
        leeftijd: formData.get('leeftijd'),
        nummer_een_doel: formData.get('nummer_een_doel'),
        obstakel: formData.get('obstakel'),
        urgentie: formData.get('urgentie'),
        budget: formData.get('budget'),
        bereid: formData.get('bereid'),
        naam: formData.get('naam'),
        email: formData.get('email'),
        telefoon: formData.get('telefoon'),
        instagram: formData.get('instagram'),
        status: 'nieuw',
        bron: attribution.utm_source || 'direct',
        utm_source: attribution.utm_source || '',
        utm_medium: attribution.utm_medium || '',
        utm_campaign: attribution.utm_campaign || '',
        utm_content: attribution.utm_content || '',
        referrer: attribution.referrer || '',
        lang: currentLang,
        notities: ''
    };

    // Always save locally FIRST — guarantees lead is never lost even if backend is down
    try {
        const existing = JSON.parse(localStorage.getItem('julia_leads') || '[]');
        existing.push(lead);
        localStorage.setItem('julia_leads', JSON.stringify(existing));
    } catch (e) { console.error('Storage error:', e); }

    // Try to save to backend with retry. If all retries fail, queue for later retry on next page load.
    const backendOk = await submitLeadWithRetry(lead);
    if (!backendOk) {
        queueLead(lead);
        // sendBeacon as final attempt — survives page close/reload
        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(lead)], { type: 'application/json' });
                navigator.sendBeacon('/api/leads', blob);
            }
        } catch(e) {}
    }

    // Conversion event to all tracking platforms
    if (window.__trackEvent) {
        window.__trackEvent('lead_submitted', {
            doel: lead.doel_type,
            urgentie: lead.urgentie,
            budget: lead.budget,
            source: lead.bron
        });
    }
    // Meta standard "Lead" event
    try { if (window.fbq) fbq('track', 'Lead'); } catch(e) {}
    // TikTok standard "CompleteRegistration"
    try { if (window.ttq) ttq.track('CompleteRegistration'); } catch(e) {}
    // GA4 generate_lead
    try { if (window.gtag) gtag('event', 'generate_lead', { value: Number(lead.budget) || 0, currency: 'EUR' }); } catch(e) {}

    clearProgress();
    window.__lastLeadId = lead.id;
    document.getElementById('succesModal').classList.add('active');
    // Reset availability form state for repeat submissions
    const avForm = document.getElementById('availabilityForm');
    const avSuccess = document.getElementById('avSuccess');
    if (avForm) avForm.hidden = true;
    if (avSuccess) avSuccess.hidden = true;
    const beschikBtn = document.getElementById('beschikbaarheidBtn');
    if (beschikBtn) beschikBtn.hidden = false;
    form.reset();
    currentStep = 1;
    showStep(1, false);
});

// ===== LEAD PERSISTENCE (retry + queue + drain) =====
// Lead submission has absolute priority. Flow:
// 1. localStorage save (happens before network — never lost even offline).
// 2. POST with 3 retries + exponential backoff.
// 3. If still failing → queue locally. Drain queue on every page load.
// 4. sendBeacon as last-resort fallback (survives page close).
const LEAD_QUEUE_KEY = 'julia_leads_queue';
async function submitLeadWithRetry(lead, maxAttempts = 3) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lead),
                // keepalive lets the request survive page navigation
                keepalive: true
            });
            if (res.ok) return true;
            if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
                // Client error (bad data) — retrying won't help, but keep queue as safety net
                console.warn('Lead POST client error:', res.status);
                return false;
            }
        } catch (e) {
            console.warn(`Lead POST attempt ${i + 1} failed:`, e.message);
        }
        // Exponential backoff: 500ms, 1500ms, 4000ms
        if (i < maxAttempts - 1) {
            await new Promise(r => setTimeout(r, [500, 1500, 4000][i]));
        }
    }
    return false;
}
function queueLead(lead) {
    try {
        const q = JSON.parse(localStorage.getItem(LEAD_QUEUE_KEY) || '[]');
        if (!q.some(l => l.id === lead.id)) q.push(lead);
        localStorage.setItem(LEAD_QUEUE_KEY, JSON.stringify(q));
    } catch (e) { console.error('Queue error:', e); }
}
async function drainLeadQueue() {
    let q;
    try { q = JSON.parse(localStorage.getItem(LEAD_QUEUE_KEY) || '[]'); }
    catch { return; }
    if (!q.length) return;
    const remaining = [];
    for (const lead of q) {
        const ok = await submitLeadWithRetry(lead, 2);
        if (!ok) remaining.push(lead);
    }
    try {
        if (remaining.length) localStorage.setItem(LEAD_QUEUE_KEY, JSON.stringify(remaining));
        else localStorage.removeItem(LEAD_QUEUE_KEY);
    } catch(e) {}
    if (q.length > remaining.length) {
        console.log(`[Lead queue] drained ${q.length - remaining.length} pending leads`);
    }
}
// Drain on page load + visibility change (covers deploy-in-progress scenarios)
window.addEventListener('load', () => setTimeout(drainLeadQueue, 1500));
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') drainLeadQueue();
});

// ===== ALMOST DONE MODAL HANDLERS =====
(function setupAlmostDoneModal() {
    const modal = document.getElementById('succesModal');
    if (!modal) return;

    const closeBtn = document.getElementById('successCloseX');
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    // "Stuur beschikbaarheid" → reveal inline form
    const beschikBtn = document.getElementById('beschikbaarheidBtn');
    const avForm = document.getElementById('availabilityForm');
    if (beschikBtn && avForm) {
        beschikBtn.addEventListener('click', () => {
            avForm.hidden = false;
            beschikBtn.hidden = true;
            avForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    // Submit availability → PUT /api/leads/:id
    const avSubmit = document.getElementById('avSubmitBtn');
    if (avSubmit) {
        avSubmit.addEventListener('click', async () => {
            const days = Array.from(document.querySelectorAll('input[name="av_days"]:checked')).map(el => el.value);
            const tijdvak = document.getElementById('avTijdvak').value;
            const opmerkingen = document.getElementById('avOpmerkingen').value.trim();
            const payload = {
                availability_days: days,
                availability_tijdvak: tijdvak,
                availability_opmerkingen: opmerkingen,
                availability_submitted_at: new Date().toISOString()
            };
            const leadId = window.__lastLeadId;
            avSubmit.disabled = true;
            avSubmit.textContent = 'Versturen...';
            try {
                if (leadId) {
                    await fetch('/api/leads/' + encodeURIComponent(leadId), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
            } catch (e) { console.warn('Availability save failed:', e); }
            // Show success state
            const fields = avForm.querySelectorAll('.av-field, .availability-form h3, #avSubmitBtn');
            fields.forEach(f => f.style.display = 'none');
            document.getElementById('avSuccess').hidden = false;
            try { if (window.fbq) fbq('trackCustom', 'AvailabilitySubmitted'); } catch(e) {}
        });
    }

    // Video card placeholder — opens alert until real video is connected
    const videoCard = document.getElementById('juliaVideoCard');
    if (videoCard) {
        const openVideo = () => {
            // TODO: replace with real video URL (YouTube iframe or direct mp4)
            alert('Julia is bezig met het opnemen van de video. Voor nu: we nemen snel contact met je op!');
        };
        videoCard.addEventListener('click', openVideo);
        videoCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openVideo(); }
        });
    }
})();

// ===== TIMELINE SCROLL-FILL + Foundation/Elite Toggle =====
// De gloeiende roze balk vult mee met scrollen. Werkt nu op meerdere
// timeline-varianten (Foundation / Elite) — alleen de actieve variant
// krijgt de fill-update.
(function setupTimelineFill() {
    const timelines = [...document.querySelectorAll('.timeline')];
    if (!timelines.length) return;

    function activeTimeline() {
        // Als er varianten zijn: pak de actieve. Anders: gewoon de eerste.
        return document.querySelector('.timeline-variant.is-active') || timelines[0];
    }

    let ticking = false;
    function update() {
        ticking = false;
        const timeline = activeTimeline();
        if (!timeline) return;
        const rect = timeline.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const anchor = vh * 0.6;
        const total = rect.height;
        const progressed = anchor - rect.top;
        let t = total > 0 ? progressed / total : 0;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        timeline.style.setProperty('--fill', t.toFixed(4));

        // Dots van de actieve timeline lighten up
        const dots = timeline.querySelectorAll('.timeline-dot');
        for (const dot of dots) {
            const d = dot.getBoundingClientRect();
            const dotCenter = d.top + d.height / 2;
            dot.classList.toggle('is-active', dotCenter < anchor);
        }
        const phases = timeline.querySelectorAll('.timeline-phase');
        for (const phase of phases) {
            const p = phase.getBoundingClientRect();
            const active = p.top < anchor && p.bottom > anchor * 0.4;
            phase.classList.toggle('is-active', active);
        }
    }
    function schedule() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('load', update);
    update();

    // Toggle-knoppen Foundation / Elite
    const toggleBtns = document.querySelectorAll('.program-toggle-wrap button[data-variant]');
    // Content dat per variant wisselt in de program-header (badge + h2 + subtitle).
    const PROGRAM_META = {
        foundation: {
            badge: 'Foundation',
            title: 'Het Foundation Programma',
            subtitle: '4 maanden met 8 persoonlijke sessies, dagelijkse check-ins, voedings- en trainingsplan op maat.',
        },
        elite: {
            badge: '★ Elite',
            title: 'Het Elite Programma',
            subtitle: '6 maanden premium met 2 fysieke gym-dagen, 24/7 WhatsApp en ~14 persoonlijke sessies.',
        },
    };
    const programBadge = document.getElementById('programBadge');
    const programTitle = document.getElementById('programTitle');
    const programSubtitle = document.getElementById('programSubtitle');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const variant = btn.dataset.variant;
            toggleBtns.forEach(b => {
                const active = b.dataset.variant === variant;
                b.classList.toggle('active', active);
                b.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            document.querySelectorAll('.timeline-variant').forEach(t => {
                t.classList.toggle('is-active', t.dataset.variant === variant);
                // Reset fill + dot-state op de net getoonde timeline
                t.style.setProperty('--fill', 0);
                t.querySelectorAll('.timeline-dot').forEach(d => d.classList.remove('is-active'));
            });
            // Update header-tekst: badge + titel + subtitle
            const meta = PROGRAM_META[variant];
            if (meta) {
                if (programBadge) programBadge.textContent = meta.badge;
                if (programTitle) programTitle.textContent = meta.title;
                if (programSubtitle) programSubtitle.textContent = meta.subtitle;
            }
            // Recompute voor de nieuwe variant
            requestAnimationFrame(update);
            requestAnimationFrame(() => setTimeout(update, 60));
        });
    });
})();

// ===== CRM HELPERS =====
window.juliaLeads = {
    getAll: () => JSON.parse(localStorage.getItem('julia_leads') || '[]'),
    exportCSV: () => {
        const leads = JSON.parse(localStorage.getItem('julia_leads') || '[]');
        if (!leads.length) return alert('Geen leads.');
        const h = ['Naam','Email','Telefoon','Instagram','Doel','Leeftijd','Doel Detail','Obstakel','Urgentie','Budget','Status','Taal','Datum'];
        const rows = leads.map(l => [l.naam,l.email,l.telefoon,l.instagram,l.doel_type,l.leeftijd,`"${(l.nummer_een_doel||'').replace(/"/g,'""')}"`,`"${(l.obstakel||'').replace(/"/g,'""')}"`,l.urgentie,l.budget,l.status,l.lang||'nl',l.timestamp]);
        const csv = [h.join(','), ...rows.map(r => r.join(','))].join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'}));
        a.download = `julia-leads-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    },
    count: () => JSON.parse(localStorage.getItem('julia_leads') || '[]').length
};

// ===== ANIMATIONS =====
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }`;
document.head.appendChild(shakeStyle);

// ===== SMOOTH SCROLL =====
document.querySelectorAll('a[href="#vragenlijst"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('vragenlijst').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// ===== INIT =====
restoreProgress();
showStep(1, false);
setupHeroPhoto();

// Auto-save form progress on any input change
form.addEventListener('input', saveProgress);
form.addEventListener('change', saveProgress);

// Force scroll to top on initial page load (prevents browser from restoring previous scroll position)
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

// Apply saved language
if (currentLang !== 'nl') {
    document.querySelector(`.lang-btn[data-lang="${currentLang}"]`)?.classList.add('active');
    document.querySelector('.lang-btn[data-lang="nl"]')?.classList.remove('active');
}
applyTranslations(currentLang);

// ===== MOBILE STICKY CTA =====
// Appears after user scrolls past hero, hides when form section is in view
(function setupMobileStickyCTA() {
    const stickyCTA = document.getElementById('mobileStickyCTA');
    const formSection = document.getElementById('vragenlijst');
    if (!stickyCTA || !formSection) return;

    let formVisible = false;
    if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(e => { formVisible = e.isIntersecting; });
            update();
        }, { threshold: 0.15 });
        obs.observe(formSection);
    }

    let ticking = false;
    function update() {
        const scrolled = window.scrollY > 400; // show after passing hero
        const shouldShow = scrolled && !formVisible;
        stickyCTA.classList.toggle('visible', shouldShow);
        stickyCTA.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        ticking = false;
    }
    window.addEventListener('scroll', () => {
        if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
})();
