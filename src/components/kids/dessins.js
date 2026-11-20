// Coloriages intégrés (dessins originaux, traits noirs sur fond blanc). Chaque dessin : { id, titre, histoire, svg }.
// Le moteur de coloriage (AtelierColoriage) remplit les zones fermées entre les traits.
// Formes avec fill="#fff" : elles cachent les traits placés derrière elles (les zones restent fermées).

const S = 'stroke="#111" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"';
const svg = (contenu) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="#fff"/><g ${S} fill="#fff">${contenu}</g></svg>`;

export const DESSINS = [
  {
    id: "arche",
    titre: "L'arche de Noé",
    histoire: "Genèse 6 à 9",
    svg: svg(`
      <path d="M40 330 A260 230 0 0 1 560 330" fill="none"/>
      <path d="M80 330 A220 190 0 0 1 520 330" fill="none"/>
      <path d="M120 330 A180 150 0 0 1 480 330" fill="none"/>
      <circle cx="510" cy="90" r="45"/>
      <path d="M95 190 q20 -25 40 0 q20 -25 40 0" fill="none"/>
      <path d="M70 380 L530 380 L470 470 L130 470 Z"/>
      <line x1="100" y1="425" x2="500" y2="425"/>
      <rect x="200" y="290" width="200" height="90"/>
      <path d="M180 295 L300 230 L420 295 Z"/>
      <rect x="235" y="315" width="40" height="40"/>
      <rect x="325" y="315" width="40" height="40"/>
      <path d="M0 500 q50 -30 100 0 q50 30 100 0 q50 -30 100 0 q50 30 100 0 q50 -30 100 0 q50 30 100 0 L600 600 L0 600 Z"/>
      <path d="M0 550 q50 -25 100 0 q50 25 100 0 q50 -25 100 0 q50 25 100 0 q50 -25 100 0 q50 25 100 0" fill="none"/>
      <path d="M430 200 q20 -20 40 -5 l25 -15 l-10 25 q-15 20 -45 10 z"/>
    `),
  },
  {
    id: "jonas",
    titre: "Jonas et le grand poisson",
    histoire: "Jonas 1 et 2",
    svg: svg(`
      <circle cx="90" cy="90" r="45"/>
      <path d="M60 300 C120 150 380 150 470 280 L560 210 L540 330 L560 450 L470 380 C380 500 120 470 60 300 Z"/>
      <circle cx="140" cy="270" r="20"/>
      <circle cx="145" cy="270" r="7" fill="#111"/>
      <path d="M70 320 q60 30 140 10" fill="none"/>
      <path d="M260 210 q40 60 0 150" fill="none"/>
      <path d="M300 230 q30 50 0 110" fill="none"/>
      <path d="M330 420 l40 60 l30 -60" />
      <circle cx="240" cy="110" r="14"/>
      <circle cx="270" cy="70" r="10"/>
      <circle cx="300" cy="40" r="7"/>
      <path d="M0 520 q50 -30 100 0 q50 30 100 0 q50 -30 100 0 q50 30 100 0 q50 -30 100 0 q50 30 100 0 L600 600 L0 600 Z"/>
      <path d="M420 110 q15 -15 30 0 q15 -15 30 0" fill="none"/>
    `),
  },
  {
    id: "creche",
    titre: "La crèche de Noël",
    histoire: "Luc 2",
    svg: svg(`
      <path d="M300 30 l18 45 l48 3 l-37 30 l12 47 l-41 -26 l-41 26 l12 -47 l-37 -30 l48 -3 z"/>
      <path d="M70 280 L300 150 L530 280 Z"/>
      <rect x="110" y="280" width="380" height="250"/>
      <line x1="110" y1="530" x2="490" y2="530"/>
      <path d="M200 470 L230 410 L370 410 L400 470 Z"/>
      <path d="M220 470 L210 520 M380 470 L390 520" fill="none"/>
      <path d="M235 410 q15 -30 40 -25 q20 -30 50 0 q25 -5 40 25" />
      <circle cx="300" cy="380" r="28"/>
      <path d="M276 372 q24 -30 48 0" />
      <path d="M0 530 L600 530 L600 600 L0 600 Z"/>
      <path d="M140 330 l20 -20 M170 340 l25 -15 M440 330 l-20 -20 M410 345 l-25 -15" fill="none"/>
      <circle cx="80" cy="80" r="6"/><circle cx="510" cy="70" r="6"/><circle cx="470" cy="140" r="5"/><circle cx="130" cy="150" r="5"/>
    `),
  },
  {
    id: "lion",
    titre: "Daniel et les lions",
    histoire: "Daniel 6",
    svg: svg(`
      <path transform="translate(300 255) scale(1.32) translate(-300 -255)" stroke-width="5.3" d="M300 70 l35 40 l45 -25 l10 50 l50 0 l-15 48 l45 25 l-38 35 l30 40 l-48 12 l5 50 l-48 -15 l-20 45 l-36 -32 l-36 32 l-20 -45 l-48 15 l5 -50 l-48 -12 l30 -40 l-38 -35 l45 -25 l-15 -48 l50 0 l10 -50 l45 25 z"/>
      <circle cx="300" cy="260" r="115"/>
      <circle cx="255" cy="235" r="16"/><circle cx="345" cy="235" r="16"/>
      <circle cx="255" cy="238" r="6" fill="#111"/><circle cx="345" cy="238" r="6" fill="#111"/>
      <path d="M275 285 L325 285 L300 310 Z"/>
      <path d="M300 310 q-25 35 -50 10 M300 310 q25 35 50 10" fill="none"/>
      <circle cx="200" cy="170" r="22"/><circle cx="400" cy="170" r="22"/>
      <path d="M0 480 L600 480 L600 600 L0 600 Z"/>
      <path d="M60 480 q20 -40 40 0 M480 480 q20 -50 40 0" />
      <path d="M150 560 q20 -15 40 0 M380 550 q20 -15 40 0" fill="none"/>
    `),
  },
  {
    id: "creation",
    titre: "La Création",
    histoire: "Genèse 1",
    svg: svg(`
      <circle cx="120" cy="110" r="55"/>
      <path d="M120 30 v-15 M120 205 v-15 M40 110 h-15 M215 110 h-15 M65 55 l-12 -12 M175 165 l12 12 M175 55 l12 -12 M65 165 l-12 12" fill="none"/>
      <path d="M470 60 a60 60 0 1 0 50 95 a48 48 0 1 1 -50 -95 z"/>
      <path d="M340 70 l7 17 l18 1 l-14 11 l5 18 l-16 -10 l-16 10 l5 -18 l-14 -11 l18 -1 z"/>
      <path d="M0 330 q150 -70 300 0 q150 70 300 0 L600 420 L0 420 Z"/>
      <rect x="440" y="230" width="34" height="110"/>
      <circle cx="457" cy="210" r="65"/>
      <path d="M90 330 l0 -50 M90 280 q-20 -25 0 -40 q20 15 0 40" />
      <circle cx="170" cy="300" r="14"/><path d="M170 314 v28" fill="none"/>
      <path d="M0 420 L600 420 L600 600 L0 600 Z"/>
      <path d="M150 500 q60 -50 120 0 q-60 50 -120 0 z"/><path d="M270 500 l35 -25 l0 50 z"/>
      <circle cx="180" cy="492" r="6" fill="#111"/>
      <path d="M380 540 q40 -30 80 0 q-40 30 -80 0 z"/><path d="M460 540 l25 -18 l0 36 z"/>
      <path d="M260 180 q25 -25 50 0 q25 -25 50 0" fill="none"/>
    `),
  },
  {
    id: "berger",
    titre: "Le bon berger",
    histoire: "Jean 10 · Psaume 23",
    svg: svg(`
      <circle cx="500" cy="90" r="50"/>
      <path d="M0 360 q150 -90 300 -20 q150 70 300 -10 L600 600 L0 600 Z"/>
      <path d="M120 470 c-40 0 -50 -50 -20 -65 c-5 -40 50 -55 70 -25 c25 -30 80 -10 70 30 c35 10 30 65 -10 60 c-15 25 -90 25 -110 0 z"/>
      <ellipse cx="85" cy="430" rx="30" ry="24"/>
      <circle cx="78" cy="425" r="5" fill="#111"/>
      <path d="M140 490 v40 M200 490 v40" fill="none"/>
      <path d="M330 500 c-30 0 -38 -38 -15 -50 c-4 -30 38 -42 53 -19 c19 -23 60 -8 53 23 c26 8 23 49 -8 45 c-11 19 -68 19 -83 0 z"/>
      <ellipse cx="305" cy="470" rx="23" ry="18"/>
      <circle cx="300" cy="466" r="4" fill="#111"/>
      <path d="M350 515 v30 M395 515 v30" fill="none"/>
      <path d="M470 560 L470 260 c0 -45 60 -45 60 0" fill="none"/>
      <path d="M200 170 q20 -20 40 0 q20 -20 40 0" fill="none"/>
    `),
  },
  {
    id: "mer",
    titre: "Moïse et la mer",
    histoire: "Exode 14",
    svg: svg(`
      <circle cx="300" cy="80" r="45"/>
      <path d="M0 140 q40 -30 80 0 q40 -30 80 0 q20 -15 40 0 L230 600 L0 600 Z"/>
      <path d="M600 140 q-40 -30 -80 0 q-40 -30 -80 0 q-20 -15 -40 0 L370 600 L600 600 Z"/>
      <path d="M30 260 q40 -25 80 0 q40 -25 80 0 M20 400 q40 -25 80 0 q40 -25 80 0" fill="none"/>
      <path d="M570 260 q-40 -25 -80 0 q-40 -25 -80 0 M580 400 q-40 -25 -80 0 q-40 -25 -80 0" fill="none"/>
      <path d="M230 600 L270 240 L330 240 L370 600 Z"/>
      <circle cx="300" cy="330" r="22"/>
      <path d="M270 450 L285 352 L315 352 L330 450 Z"/>
      <path d="M320 370 L360 300" fill="none"/>
      <line x1="362" y1="250" x2="362" y2="460"/>
    `),
  },
  {
    id: "david",
    titre: "David et Goliath",
    histoire: "1 Samuel 17",
    svg: svg(`
      <circle cx="100" cy="90" r="45"/>
      <path d="M0 470 q150 -40 300 0 q150 40 300 0 L600 600 L0 600 Z"/>
      <path d="M380 470 L390 190 L520 190 L530 470 Z"/>
      <circle cx="455" cy="140" r="48"/>
      <path d="M400 125 q55 -70 110 0 Z"/>
      <rect x="430" y="125" width="50" height="14"/>
      <ellipse cx="370" cy="300" rx="45" ry="70"/>
      <circle cx="370" cy="300" r="14"/>
      <path d="M540 200 L560 470" fill="none"/>
      <path d="M548 200 l-10 -40 l30 -5 z"/>
      <circle cx="150" cy="330" r="26"/>
      <path d="M125 470 L135 360 L165 360 L175 470 Z"/>
      <path d="M165 380 L230 300" fill="none"/>
      <path d="M230 300 q30 -10 20 20 q-25 5 -20 -20 z"/>
      <circle cx="80" cy="540" r="16"/><circle cx="120" cy="555" r="12"/><circle cx="60" cy="575" r="10"/>
    `),
  },
];
