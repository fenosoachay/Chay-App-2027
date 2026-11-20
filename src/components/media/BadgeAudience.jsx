import React from "react";

// Sous un contenu réservé : « VIP » en doré, « Membre » en vert. Rien pour « Tout le monde ».
export default function BadgeAudience({ audience, className = "" }) {
  if (audience === "vip") {
    return (
      <span className={`inline-flex items-center rounded-full bg-gradient-to-r from-[#B8860B] via-[#F2C94C] to-[#B8860B] px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wider text-[#3d2a00] shadow-sm ${className}`}>
        VIP
      </span>
    );
  }
  if (audience === "membre") {
    return (
      <span className={`inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wider text-white shadow-sm ${className}`}>
        Membre
      </span>
    );
  }
  return null;
}
