import React from "react";

// Fond animé de l'accueil : petites particules lumineuses, 100 % CSS (hors ligne).
// dir : "down" (bulles du haut, elles descendent), "up" (bulles du bas, elles
// montent), "mid" (milieu, elles oscillent). range = amplitude en px.
// La durée varie de ±10 % autour de 6 s pour un effet organique.
const DOTS = [
  { top: "10%", left: "30%", size: 7, color: "#4A6CFE", delay: "0.3s", dur: 6.3, dir: "down", range: 110 },
  { top: "22%", left: "12%", size: 8, color: "#8A56E2", delay: "0s", dur: 5.6, dir: "down", range: 120 },
  { top: "28%", right: "10%", size: 8, color: "#FF57B2", delay: "1.2s", dur: 6.4, dir: "down", range: 100 },
  { top: "48%", right: "22%", size: 7, color: "#4A6CFE", delay: "2.1s", dur: 5.8, dir: "mid", range: 120 },
  { top: "52%", left: "6%", size: 6, color: "#8A56E2", delay: "0.9s", dur: 6.2, dir: "mid", range: 100 },
  { top: "68%", left: "9%", size: 8, color: "#4A6CFE", delay: "0.6s", dur: 6.0, dir: "up", range: 130 },
  { top: "76%", right: "17%", size: 7, color: "#FF57B2", delay: "1.7s", dur: 5.7, dir: "up", range: 120 },
  { top: "88%", left: "42%", size: 7, color: "#8A56E2", delay: "1s", dur: 6.4, dir: "up", range: 110 },
];

export default function AnimatedBlobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {DOTS.map((d, i) => (
        <span
          key={i}
          className={`home-dot ${
            d.dir === "down" ? "home-dot-down" : d.dir === "up" ? "home-dot-up" : "home-dot-mid"
          }`}
          style={{
            top: d.top,
            left: d.left,
            right: d.right,
            width: d.size,
            height: d.size,
            background: d.color,
            boxShadow: `0 0 12px 2px ${d.color}`,
            animationDelay: d.delay,
            animationDuration: `${d.dur}s`,
            "--dot-range": `${d.range}px`,
          }}
        />
      ))}
    </div>
  );
}