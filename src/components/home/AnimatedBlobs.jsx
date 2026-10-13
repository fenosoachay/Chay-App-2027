import React from "react";

// Fond animé de l'accueil : deux vagues fluides en S (haut gauche / bas droite)
// au dégradé lumineux, et des particules. 100 % CSS/SVG : fonctionne hors ligne.
const DOTS = [
  { top: "22%", left: "12%", size: 8, color: "#8A56E2", delay: "0s" },
  { top: "28%", right: "10%", size: 8, color: "#FF57B2", delay: "1.2s" },
  { top: "48%", right: "22%", size: 7, color: "#4A6CFE", delay: "2.1s" },
  { top: "68%", left: "9%", size: 8, color: "#4A6CFE", delay: "0.6s" },
  { top: "76%", right: "17%", size: 7, color: "#FF57B2", delay: "1.7s" },
];

// Vague du coin haut gauche : bord inférieur/droit en S, rose en haut à droite.
function WaveTopLeft() {
  return (
    <svg viewBox="0 0 400 400" overflow="visible" className="home-wave home-wave-tl" preserveAspectRatio="xMinYMin meet">
      <defs>
        <linearGradient id="waveTL" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#0A6CFF" />
          <stop offset="45%" stopColor="#3B2FD0" />
          <stop offset="75%" stopColor="#B338E0" />
          <stop offset="100%" stopColor="#FF4FA3" />
        </linearGradient>
      </defs>
      <path d="M-80 -80 H300 C380 -20 330 70 255 110 C190 145 185 200 150 250 C115 300 50 335 -80 320 Z" fill="url(#waveTL)" />
    </svg>
  );
}

// Vague du coin bas droite : bord supérieur/gauche en S, violet puis bleu.
function WaveBottomRight() {
  return (
    <svg viewBox="0 0 400 500" overflow="visible" className="home-wave home-wave-br" preserveAspectRatio="xMaxYMax meet">
      <defs>
        <linearGradient id="waveBR" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#0A6CFF" />
          <stop offset="50%" stopColor="#2A3FE0" />
          <stop offset="100%" stopColor="#9B3BE8" />
        </linearGradient>
      </defs>
      <path d="M480 -10 C370 -20 320 60 295 150 C270 235 225 262 170 290 C100 325 60 400 70 580 H480 Z" fill="url(#waveBR)" />
    </svg>
  );
}

export default function AnimatedBlobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <WaveTopLeft />
      <WaveBottomRight />
      {DOTS.map((d, i) => (
        <span
          key={i}
          className="home-dot"
          style={{
            top: d.top,
            left: d.left,
            right: d.right,
            width: d.size,
            height: d.size,
            background: d.color,
            boxShadow: `0 0 12px 2px ${d.color}`,
            animationDelay: d.delay,
          }}
        />
      ))}
    </div>
  );
}