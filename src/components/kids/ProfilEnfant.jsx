import React, { useState } from "react";
import { AVATARS, enregistrerProfilEnfant, pseudoValide } from "@/lib/scoreBoard";

// Profil d'enfant pour le Score Board : un pseudo (jamais le nom du compte du parent) et un avatar dessiné.
export default function ProfilEnfant({ profil, onChange, onAnnuler }) {
  const [pseudo, setPseudo] = useState(profil?.pseudo || "");
  const [avatar, setAvatar] = useState(profil?.avatar || AVATARS[0]);
  const ok = Boolean(pseudoValide(pseudo));

  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-4 md:p-5">
      <p className="font-display text-lg font-extrabold">Choisis ton pseudo et ton animal</p>
      <p className="mb-3 text-sm text-foreground/60">C'est ce que les autres verront au classement.</p>
      <input
        value={pseudo}
        onChange={(e) => setPseudo(e.target.value.slice(0, 20))}
        placeholder="Ton pseudo (ex. : Petit Lion)"
        className="mb-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base font-semibold outline-none focus:border-primary"
      />
      <div className="mb-4 grid grid-cols-8 gap-1.5">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAvatar(a)}
            aria-label={`Avatar ${a}`}
            className={`grid aspect-square place-items-center rounded-xl text-2xl transition ${avatar === a ? "bg-primary/20 ring-2 ring-primary" : "bg-muted/60"}`}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {onAnnuler && (
          <button type="button" onClick={onAnnuler} className="flex-1 rounded-full border border-border px-4 py-2.5 font-semibold">
            Annuler
          </button>
        )}
        <button
          type="button"
          disabled={!ok}
          onClick={() => { const p = enregistrerProfilEnfant(pseudo, avatar); if (p) onChange(p); }}
          className="flex-1 rounded-full brand-gradient px-4 py-2.5 font-bold text-white disabled:opacity-40"
        >
          C'est moi !
        </button>
      </div>
      {pseudo && !ok && <p className="mt-2 text-xs text-destructive">2 à 20 lettres ou chiffres.</p>}
    </div>
  );
}
