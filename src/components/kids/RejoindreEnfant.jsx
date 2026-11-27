import React, { useState } from "react";
import { Loader2 } from "lucide-react";

// Code famille (1.4.1) : un autre adulte (grand-mère, tante…) tape le code à 6 chiffres donné par le parent ; l'enfant
// apparaît alors dans « Qui joue ? » avec ses points et sa progression (le même profil que chez le parent).
export default function RejoindreEnfant({ onRejoindre, onAnnuler }) {
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const complet = code.length === 6;

  const valider = async () => {
    if (!complet || envoi) return;
    setEnvoi(true);
    setErreur("");
    try {
      await onRejoindre(code);
    } catch (e) {
      setErreur(e?.message || "Code non accepté. Vérifie la connexion.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-4 md:p-5">
      <p className="font-display text-lg font-extrabold">J'ai un code famille</p>
      <p className="text-sm text-foreground/60">Le parent de l'enfant te l'a donné.</p>
      <label className="relative mx-auto my-5 flex w-fit gap-1.5">
        <span className="sr-only">Code famille à 6 chiffres</span>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`grid h-12 w-10 place-items-center rounded-xl border-2 text-2xl font-black tabular-nums ${i === code.length ? "border-primary" : "border-border"}`}
          >
            {code[i] || ""}
          </span>
        ))}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => { if (e.key === "Enter") valider(); }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={onAnnuler} className="flex-1 rounded-full border border-border px-4 py-2.5 font-semibold">Annuler</button>
        <button
          type="button"
          disabled={!complet || envoi}
          onClick={valider}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full brand-gradient px-4 py-2.5 font-bold text-white disabled:opacity-40"
        >
          {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
          Rejoindre
        </button>
      </div>
      {erreur && <p className="mt-2 text-center text-sm text-destructive">{erreur}</p>}
    </div>
  );
}
