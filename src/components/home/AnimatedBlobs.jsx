import React from "react";

// Fond animé de l'accueil : uniquement de petites particules lumineuses.
// 100 % CSS : fonctionne hors ligne.
const DOTS = [
  { top: "22%", left: "12%", size: 8, color: "#8A56E2", delay: "0s" },
  { top: "28%", right: "10%", size: 8, color: "#FF57B2", delay: "1.2s" },
  { top: "48%", right: "22%", size: 7, color: "#4A6CFE", delay: "2.1s" },
  { top: "68%", left: "9%", size: 8, color: "#4A6CFE", delay: "0.6s" },
  { top: "76%", right: "17%", size: 7, color: "#FF57B2", delay: "1.7s" },
];

export default function AnimatedBlobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
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