import React from "react";

// Sous un contenu réservé aux VIP : « VIP » en doré. Seuls les VIP (et les admins) voient ces contenus,
// donc seuls eux voient l'étiquette. Rien pour « Membre » ni « Tout le monde » (pas de mention visible).
export default function BadgeAudience({ audience, className = "" }) {
  if (audience !== "vip") return null;
  return (
    <span className={`inline-flex items-center rounded-full bg-gradient-to-r from-[#B8860B] via-[#F2C94C] to-[#B8860B] px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wider text-[#3d2a00] shadow-sm ${className}`}>
      VIP
    </span>
  );
}
