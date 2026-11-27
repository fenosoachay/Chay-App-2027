import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { AVATARS, pseudoValide } from "@/lib/scoreBoard";
import { memePseudo } from "@/lib/profilsEnfants";

// Nouvel enfant pour le Score Board : un pseudo (jamais le nom du compte du parent) et un avatar dessiné.
// 1.3.26 : enregistré sur le compte (onEnregistrer -> src/lib/profilsEnfants.js), plus seulement sur le téléphone.
export default function ProfilEnfant({ titre = "Choisis ton pseudo et ton animal", existants = [], onEnregistrer, onAnnuler, onCodeFamille }) {
  const [pseudo, setPseudo] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const valide = Boolean(pseudoValide(pseudo));
  const doublon = valide && existants.some((e) => memePseudo(e.pseudo, pseudo));

  const enregistrer = async () => {
    if (!valide || doublon || envoi) return;
    setEnvoi(true);
    setErreur("");
    try {
      await onEnregistrer(pseudo, avatar);
    } catch (e) {
      setErreur(e?.message || "Enregistrement impossible. Vérifie la connexion.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-4 md:p-5">
      <p className="font-display text-lg font-extrabold">{titre}</p>
      <p className="mb-3 text-sm text-foreground/60">C'est ce que les autres verront au classement : un prénom ou un pseudo, jamais le nom de famille.</p>
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
          disabled={!valide || doublon || envoi}
          onClick={enregistrer}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full brand-gradient px-4 py-2.5 font-bold text-white disabled:opacity-40"
        >
          {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
          C'est moi !
        </button>
      </div>
      {pseudo && !valide && <p className="mt-2 text-xs text-destructive">2 à 20 lettres ou chiffres.</p>}
      {doublon && <p className="mt-2 text-xs text-destructive">Ce prénom est déjà dans la liste : touche-le dans « Qui joue ? ».</p>}
      {erreur && <p className="mt-2 text-xs text-destructive">{erreur}</p>}
      {/* 1.4.1 : l'enfant joue déjà chez ses parents ? On rejoint son profil avec leur code famille. */}
      {onCodeFamille && (
        <button type="button" onClick={onCodeFamille} className="mt-3 w-full text-center text-sm font-bold text-primary underline-offset-2 hover:underline">
          L'enfant joue déjà sur le compte de ses parents ? J'ai un code famille
        </button>
      )}
    </div>
  );
}
