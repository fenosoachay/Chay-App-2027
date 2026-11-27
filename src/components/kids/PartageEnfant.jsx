import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { confirmFr } from "@/lib/confirmFr";
import { partagerTexte } from "@/lib/partage";
import { codeLisible, comptesInvites, creerCodeFamille, retirerAcces } from "@/lib/profilsEnfants";

// Code famille (1.4.1) : le parent fait jouer son enfant sur un autre compte (grand-mère, tante…). Un code à
// 6 chiffres (24 h, une seule fois) est créé à l'ouverture ; la liste des comptes qui font jouer l'enfant permet de
// retirer un accès. L'enfant reste celui du parent : mêmes points, même progression, une seule ligne au classement.
export default function PartageEnfant({ profil, onFermer }) {
  const [code, setCode] = useState("");
  const [comptes, setComptes] = useState(null);
  const [erreur, setErreur] = useState("");
  const [copie, setCopie] = useState(false);

  const charger = useCallback(async () => {
    setErreur("");
    try {
      const [c, l] = await Promise.all([creerCodeFamille(profil), comptesInvites(profil)]);
      setCode(c.code);
      setComptes(l);
    } catch (e) {
      setErreur(e?.message || "Vérifie la connexion.");
      setComptes((l) => l || []);
    }
  }, [profil]);
  useEffect(() => { charger(); }, [charger]);

  const partager = async () => {
    const r = await partagerTexte({
      titre: `Code famille pour ${profil.pseudo}`,
      texte: `Code famille Chay pour ${profil.pseudo} : ${codeLisible(code)}\nÀ taper dans Chay Enfants › Jeux › Qui joue ? › Code famille (valable 24 h, une seule fois).`,
    });
    if (r === "copie") setCopie(true);
  };

  const retirer = async (c) => {
    const ok = await confirmFr({
      title: `Retirer l'accès de ${c.nom} ?`,
      message: `${profil.pseudo} ne sera plus sur ce compte. Ses points restent chez toi.`,
      confirmLabel: "Retirer",
      cancelLabel: "Garder",
    });
    if (!ok) return;
    try {
      await retirerAcces(profil, c.user_id);
      setComptes((l) => l.filter((x) => x.user_id !== c.user_id));
    } catch (e) {
      setErreur(e?.message || "Vérifie la connexion.");
    }
  };

  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-4 md:p-5">
      <p className="font-display text-lg font-extrabold">
        <span aria-hidden="true">{profil.avatar} </span>Faire jouer {profil.pseudo} sur un autre compte
      </p>
      <p className="mt-1 text-sm text-foreground/60">Donne ce code à la grand-mère, la tante… Elle le tape dans « Qui joue ? › Code famille ».</p>
      <div className="my-4 text-center">
        {code ? (
          <>
            <p className="font-display text-4xl font-black tracking-[0.25em] text-primary tabular-nums">{codeLisible(code)}</p>
            <p className="mt-1 text-xs text-foreground/60">Valable 24 h · une seule fois</p>
          </>
        ) : !erreur ? (
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
        ) : null}
      </div>
      {code && (
        <button type="button" onClick={partager} className="inline-flex w-full items-center justify-center gap-2 rounded-full brand-gradient px-4 py-2.5 font-bold text-white">
          <Share2 className="h-4 w-4" /> {copie ? "Code copié" : "Partager le code"}
        </button>
      )}
      {erreur && (
        <p className="mt-2 text-center text-sm text-destructive">
          {erreur} <button type="button" onClick={charger} className="font-bold underline">Réessayer</button>
        </p>
      )}
      <p className="mt-5 text-sm font-bold">Comptes qui font jouer {profil.pseudo}</p>
      {comptes === null ? (
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-primary" />
      ) : comptes.length ? (
        <ul className="mt-2 space-y-1.5">
          {comptes.map((c) => (
            <li key={c.user_id} className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{c.nom}</span>
              <button type="button" onClick={() => retirer(c)} className="shrink-0 text-sm font-bold text-destructive">Retirer l'accès</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-foreground/60">Aucun pour l'instant.</p>
      )}
      <p className="mt-4 text-center text-xs text-foreground/60">
        {profil.pseudo} reste dans ta famille : points et progression communs, une seule ligne au classement.
      </p>
      <button type="button" onClick={onFermer} className="mt-4 w-full rounded-full border border-border px-4 py-2.5 font-semibold">Terminé</button>
    </div>
  );
}
