// ===== JULIA DEN BEST — QUIZ + DATA + TRANSLATIONS + PHOTO =====

const TOTAL_STEPS = 8;
let currentStep = 1;
let currentLang = localStorage.getItem('julia_lang') || 'nl';

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
        heroTitle: 'Je verdient <span class="highlight">echt</span> persoonlijk advies, geen onzin.',
        heroSubtitle: 'Geen standaard AI-schema\'s. Geen copy-paste plannen. Geen crash dieten waar je bijna niks mag eten. <strong>Bij Julia krijg je 1-op-1 menselijke begeleiding — van iemand die jou kent, jouw lichaam begrijpt en er elke dag voor je is.</strong>',
        usp1: '100% menselijk — geen AI',
        usp2: '1-op-1 persoonlijke coaching',
        usp3: 'Op maat gemaakt voor jouw lichaam',
        heroCta: 'Ja, ik wil dit! Start mijn transformatie',
        heroGuarantee: 'Niet goed? Geld terug. Geen risico.',
        stat1: 'Vrouwen geholpen', stat2: 'Beoordeling', stat3: 'Weken traject',
        float1name: 'Emma', float1text: 'Net week 8 afgerond!',
        float2name: '-7kg in 12 weken', float2text: 'Gemiddeld resultaat',
        dropzone: 'Sleep hier je foto naartoe<br><small>of klik om te uploaden</small>',
        // Empathy
        empathyTitle: 'Herken je dit?',
        pain1: 'Je hebt al 10 dieten geprobeerd maar niks werkt',
        pain2: 'Je krijgt standaard schema\'s of copy-paste plannen zonder persoonlijk contact',
        pain3: 'Je mag bijna niks eten en voelt je ellendig',
        pain4: 'Je coach reageert pas na 3 dagen (of helemaal niet)',
        pain5: 'Je voelt je alleen en hebt niemand die je begrijpt',
        pain6: 'Je weet niet waar je moet beginnen of wat echt werkt',
        empathyDivider: 'Bij Julia is het anders',
        gain1: 'Persoonlijk plan op maat — geen one-size-fits-all',
        gain2: 'Julia staat ZELF voor je klaar, elke dag',
        gain3: 'Lekker eten en toch resultaat — geen hongerlijden',
        gain4: 'Een community van vrouwen die hetzelfde doormaken',
        gain5: 'Duurzame resultaten — geen jojo-effect',
        gain6: 'Niet goed? Geld terug. Zonder gedoe.',
        // Guarantee
        guaranteeTitle: '100% Niet-Goed-Geld-Terug Garantie',
        guaranteeText: 'Wij geloven zo sterk in ons programma dat je je geld volledig terugkrijgt als je niet tevreden bent. Geen kleine lettertjes, geen gedoe. Jouw resultaat is onze missie.',
        // Quiz
        quizTitle: 'Ontdek jouw persoonlijke plan',
        quizSubtitle: 'Beantwoord een paar vragen zodat Julia je het beste kan helpen',
        stepOf: 'Stap {n} van 8',
        q1: 'Hoe kan ik je het beste helpen?',
        q1a: 'Afvallen', q1b: 'Spiermassa opbouwen', q1c: 'Gezonde levensstijl', q1d: 'Lichaamstransformatie',
        q2: 'Wat is jouw leeftijd?',
        q2a: '16 — 17 jaar', q2b: '18 — 25 jaar', q2c: '25 — 35 jaar', q2d: '35+ jaar',
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
        q6a: '€0 — €40 per week', q6b: '€45 — €70 per week', q6c: '€70 — €100 per week', q6d: 'Geen idee, dat hoor ik graag in het gesprek',
        q7: 'Ben je bereid om tijd en geld te investeren om je transformatie waar te maken?',
        q7title: 'Ja, ik ben er klaar voor!',
        q7text: 'Ik wil investeren in mezelf en mijn gezondheid. Laten we dit samen doen!',
        q7btn: 'Ja! Ik wil starten',
        q8: 'Laatste stap — Jouw contactgegevens',
        q8sub: 'Vul je gegevens in zodat Julia persoonlijk contact met je kan opnemen',
        labelNaam: 'Volledige naam', phNaam: 'Je voor- en achternaam',
        labelEmail: 'E-mailadres', phEmail: 'naam@voorbeeld.nl',
        labelTel: 'Telefoonnummer', phTel: '06-12345678',
        labelIg: 'Hoe heet je op Instagram?', phIg: '@jouwnaam',
        btnPrev: 'Vorige', btnNext: 'Volgende',
        btnSubmit: 'Verstuur & Start Jouw Transformatie',
        trust1: '100% niet-goed-geld-terug garantie',
        trust2: 'Gratis kennismakingsgesprek',
        trust3: 'Persoonlijk contact met Julia',
        // Reviews
        reviewsTitle: 'Wat andere vrouwen zeggen',
        // Transformations
        transTitle: 'Van A naar Z — Echte Transformaties',
        transSub: 'Bekijk wat onze klanten hebben bereikt met het 12-weken programma',
        // Community
        communityBadge: 'Word Onderdeel',
        communityTitle: 'Meer dan een programma — een <span class="highlight">community</span>',
        communityText: 'Als je start bij Julia word je direct onderdeel van een exclusieve community van vrouwen die dezelfde reis maken als jij. Via onze Discord server deel je ervaringen, vier je successen en steun je elkaar op de moeilijke dagen.',
        comPerk1: 'Exclusieve Discord community alleen voor deelnemers',
        comPerk2: 'Dagelijkse motivatie en support van Julia en de groep',
        comPerk3: 'Deel je progressie, recepten en tips met andere vrouwen',
        comPerk4: 'Je staat er nooit alleen voor — altijd iemand die je begrijpt',
        comCta: 'Ik wil erbij!',
        comCount: '500+ vrouwen zijn je al voorgegaan',
        // Program
        progBadge: 'Het Programma',
        progTitle: 'Het 12-Weken Transformatie Programma',
        progSub: 'Ontdek hoe je binnen 12 weken jouw lichaam en mindset compleet transformeert',
        featTitle: 'Wat je krijgt',
        // CTA
        ctaTitle: 'Dit is jouw moment.',
        ctaText: 'Stop met twijfelen. Stop met uitstellen. Start vandaag nog met jouw transformatie.',
        ctaCta: 'Start Nu — Het Is Gratis',
        ctaGuarantee: 'Niet goed? Geld terug. Geen risico.',
        // Testimonials
        testTitle: 'Onze klanten aan het woord',
        // Modal
        modalTitle: 'Gelukt!',
        modalText: 'Bedankt voor het invullen! Julia neemt zo snel mogelijk persoonlijk contact met je op.',
        modalSub: 'Check je inbox en Instagram DM\'s — we nemen binnen 24 uur contact op!',
        modalClose: 'Sluiten',
    },
    en: {
        navCta: 'Start Now',
        heroBadge: 'Only 5 spots left this month',
        heroTitle: 'You deserve <span class="highlight">real</span> personal advice, not nonsense.',
        heroSubtitle: 'No standard AI plans. No copy-paste programs. No crash diets that leave you starving. <strong>With Julia you get 1-on-1 human coaching — from someone who knows you, understands your body and is there for you every day.</strong>',
        usp1: '100% human — no AI',
        usp2: '1-on-1 personal coaching',
        usp3: 'Tailored to your body',
        heroCta: 'Yes, I want this! Start my transformation',
        heroGuarantee: 'Not satisfied? Money back. No risk.',
        stat1: 'Women helped', stat2: 'Rating', stat3: 'Week program',
        float1name: 'Emma', float1text: 'Just completed week 8!',
        float2name: '-7kg in 12 weeks', float2text: 'Average result',
        dropzone: 'Drag your photo here<br><small>or click to upload</small>',
        empathyTitle: 'Sound familiar?',
        pain1: "You've tried 10 diets and nothing works",
        pain2: 'You get standard plans or copy-paste programs without personal contact',
        pain3: "You can barely eat anything and feel miserable",
        pain4: 'Your coach responds after 3 days (or not at all)',
        pain5: "You feel alone and have no one who understands you",
        pain6: "You don't know where to start or what actually works",
        empathyDivider: "With Julia it's different",
        gain1: 'Personal plan tailored to you — no one-size-fits-all',
        gain2: 'Julia is there for you HERSELF, every day',
        gain3: 'Eat well and still get results — no starving',
        gain4: 'A community of women going through the same journey',
        gain5: 'Sustainable results — no yo-yo effect',
        gain6: 'Not satisfied? Money back. No hassle.',
        guaranteeTitle: '100% Money-Back Guarantee',
        guaranteeText: "We believe so strongly in our program that you get a full refund if you're not satisfied. No fine print, no hassle. Your result is our mission.",
        quizTitle: 'Discover your personal plan',
        quizSubtitle: 'Answer a few questions so Julia can help you best',
        stepOf: 'Step {n} of 8',
        q1: 'How can I help you best?',
        q1a: 'Lose weight', q1b: 'Build muscle', q1c: 'Healthy lifestyle', q1d: 'Body transformation',
        q2: 'What is your age?',
        q2a: '16 — 17 years', q2b: '18 — 25 years', q2c: '25 — 35 years', q2d: '35+ years',
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
        q6a: '€0 — €40 per week', q6b: '€45 — €70 per week', q6c: '€70 — €100 per week', q6d: "Not sure, I'd like to discuss in the call",
        q7: 'Are you willing to invest time and money to make your transformation happen?',
        q7title: "Yes, I'm ready!",
        q7text: 'I want to invest in myself and my health. Let\'s do this together!',
        q7btn: 'Yes! I want to start',
        q8: 'Last step — Your contact details',
        q8sub: 'Fill in your details so Julia can personally reach out to you',
        labelNaam: 'Full name', phNaam: 'Your first and last name',
        labelEmail: 'Email address', phEmail: 'name@example.com',
        labelTel: 'Phone number', phTel: '+31 6 12345678',
        labelIg: 'What is your Instagram name?', phIg: '@yourname',
        btnPrev: 'Previous', btnNext: 'Next',
        btnSubmit: 'Submit & Start Your Transformation',
        trust1: '100% money-back guarantee',
        trust2: 'Free introduction call',
        trust3: 'Personal contact with Julia',
        reviewsTitle: 'What other women say',
        transTitle: 'From A to Z — Real Transformations',
        transSub: 'See what our clients have achieved with the 12-week program',
        communityBadge: 'Join Us',
        communityTitle: 'More than a program — a <span class="highlight">community</span>',
        communityText: 'When you start with Julia you immediately become part of an exclusive community of women making the same journey as you. Through our Discord server you share experiences, celebrate wins and support each other on the tough days.',
        comPerk1: 'Exclusive Discord community for participants only',
        comPerk2: 'Daily motivation and support from Julia and the group',
        comPerk3: 'Share your progress, recipes and tips with other women',
        comPerk4: "You're never alone — always someone who understands you",
        comCta: 'I want to join!',
        comCount: '500+ women have gone before you',
        progBadge: 'The Program',
        progTitle: 'The 12-Week Transformation Program',
        progSub: 'Discover how you can completely transform your body and mindset in 12 weeks',
        featTitle: 'What you get',
        ctaTitle: 'This is your moment.',
        ctaText: 'Stop doubting. Stop postponing. Start your transformation today.',
        ctaCta: 'Start Now — It\'s Free',
        ctaGuarantee: 'Not satisfied? Money back. No risk.',
        testTitle: 'Our clients speak',
        modalTitle: 'Success!',
        modalText: 'Thank you for filling this in! Julia will personally reach out to you as soon as possible.',
        modalSub: "Check your inbox and Instagram DM's — we'll contact you within 24 hours!",
        modalClose: 'Close',
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
    { sel: '.stat:nth-child(3) .stat-label', key: 'stat3' },
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
    { sel: '.modal-content h2', key: 'modalTitle' },
    { sel: '.modal-content > p:first-of-type', key: 'modalText' },
    { sel: '.modal-subtitle', key: 'modalSub' },
    { sel: '.modal-content .btn', key: 'modalClose' },
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
function showStep(step) {
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

    document.getElementById('vragenlijst').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        if (!ta.value.trim()) { ta.style.borderColor = '#E91E8C'; ta.focus(); return false; }
    }

    const inputs = step.querySelectorAll('input[type="text"][required], input[type="email"][required], input[type="tel"][required]');
    for (const input of inputs) {
        if (!input.value.trim()) { input.style.borderColor = '#E91E8C'; input.focus(); return false; }
    }

    const emailInput = step.querySelector('input[type="email"]');
    if (emailInput && emailInput.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
        emailInput.style.borderColor = '#E91E8C'; emailInput.focus(); return false;
    }

    return true;
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
        bron: 'landingspagina',
        lang: currentLang,
        notities: ''
    };

    // Save to backend
    try {
        await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lead)
        });
    } catch (e) { console.warn('Backend save failed, saving locally:', e); }

    // Also save locally as backup
    try {
        const existing = JSON.parse(localStorage.getItem('julia_leads') || '[]');
        existing.push(lead);
        localStorage.setItem('julia_leads', JSON.stringify(existing));
    } catch (e) { console.error('Storage error:', e); }

    document.getElementById('succesModal').classList.add('active');
    form.reset();
    currentStep = 1;
    showStep(1);
});

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
showStep(1);
setupHeroPhoto();

// Apply saved language
if (currentLang !== 'nl') {
    document.querySelector(`.lang-btn[data-lang="${currentLang}"]`)?.classList.add('active');
    document.querySelector('.lang-btn[data-lang="nl"]')?.classList.remove('active');
}
applyTranslations(currentLang);
