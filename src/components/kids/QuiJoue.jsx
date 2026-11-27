import React, { useState } from "react";
import { KeyRound, Loader2, LogOut, Plus, Settings2, Trash2, Users } from "lucide-react";
import { confirmFr } from "@/lib/confirmFr";
import ProfilEnfant from "@/components/kids/ProfilEnfant";
import PartageEnfant from "@/components/kids/PartageEnfant";
import RejoindreEnfant from "@/components/kids/RejoindreEnfant";
import { estPartage } from "@/lib/profilsEnfants";

// « Qui joue ? » (1.3.26) : les enfants enregistrés sur le compte, en grosses pastilles (animal + prénom).
// On touche son prénom pour jouer à son nom ; « Ajouter » pour un nouvel enfant ; « Gérer » pour en effacer un
// (avec tous ses points du Score Board).
// 1.4.1 : code famille. « Gérer » › bouton famille : le parent crée un code pour faire jouer l'enfant sur un autre
// compte ; « Code famille » : l'autre adulte tape ce code. Un enfant partagé porte « partagé » ; l'invité peut
// seulement le retirer de son compte (« Quitter »), jamais l'effacer.
export default function QuiJoue({
  profils, actifId, chargement, erreur, onChoisir, onAjouter, onSupprimer, onReessayer, attire,
  userId, onRejoindre, onQuitter,
}) {
  const [ajout, setAjout] = useState(false);
  const [gerer, setGerer] = useState(false);
  const [partage, setPartage] = useState(null);
  const [rejoindre, setRejoindre] = useState(false);

  if (partage) return <PartageEnfant profil={partage} onFermer={() => setPartage(null)} />;
  if (rejoindre) {
    return (
      <RejoindreEnfant
        onRejoindre={async (code) => { await onRejoindre(code); setRejoindre(false); setGerer(false); }}
        onAnnuler={() => setRejoindre(false)}
      />
    );
  }

  if (ajout || (!chargement && !erreur && !profils.length)) {
    return (
      <ProfilEnfant
        titre={profils.length ? "Nouvel enfant" : "Qui joue ? Choisis ton prénom et ton animal"}
        existants={profils}
        onEnregistrer={async (pseudo, avatar) => { await onAjouter(pseudo, avatar); setAjout(false); }}
        onAnnuler={profils.length ? () => setAjout(false) : undefined}
        onCodeFamille={onRejoindre ? () => { setAjout(false); setRejoindre(true); } : undefined}
      />
    );
  }

  const retirer = async (p) => {
    const ok = await confirmFr({
      title: `Effacer ${p.pseudo} ?`,
      message: "Son prénom et tous ses points du Score Board seront effacés. On ne pourra pas les récupérer.",
      confirmLabel: "Effacer",
      cancelLabel: "Garder",
    });
    if (ok) await onSupprimer(p);
  };

  const quitter = async (p) => {
    const ok = await confirmFr({
      title: `Retirer ${p.pseudo} de ce compte ?`,
      message: `${p.pseudo} reste chez ses parents avec tous ses points. Pour le refaire jouer ici, il faudra un nouveau code famille.`,
      confirmLabel: "Retirer",
      cancelLabel: "Garder",
    });
    if (ok) await onQuitter(p);
  };

  return (
    <section
      aria-label="Qui joue ?"
      className={`rounded-[1.75rem] border bg-card p-4 transition md:p-5 ${attire ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 font-display text-xl font-extrabold">Qui joue ?</h2>
        {profils.length > 0 && (
          <button
            type="button"
            onClick={() => setGerer((v) => !v)}
            aria-pressed={gerer}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${gerer ? "bg-primary text-primary-foreground" : "border border-border text-foreground/70"}`}
          >
            <Settings2 className="h-3.5 w-3.5" /> {gerer ? "Terminé" : "Gérer"}
          </button>
        )}
      </div>
      {chargement ? (
        <div className="grid h-24 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : erreur ? (
        <div className="py-4 text-center text-sm">
          <p className="text-foreground/60">Impossible de charger les enfants (connexion ?).</p>
          <button type="button" onClick={onReessayer} className="mt-2 rounded-full border border-border px-4 py-1.5 font-bold">Réessayer</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {profils.map((p) => {
            const actif = p.id === actifId;
            const invite = estPartage(p, userId);
            return (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => onChoisir(p)}
                  aria-pressed={actif}
                  className={`flex min-w-[5.5rem] flex-col items-center gap-1 rounded-2xl px-3 py-2.5 transition ${actif ? "bg-primary/15 ring-2 ring-primary" : "bg-muted/60 hover:bg-muted"}`}
                >
                  <span className="text-4xl leading-none" aria-hidden="true">{p.avatar}</span>
                  <span className="max-w-[7rem] truncate text-sm font-extrabold">{p.pseudo}</span>
                  {invite && <span className="rounded-md bg-primary/10 px-1.5 text-[10px] font-bold text-foreground/60">partagé</span>}
                </button>
                {gerer && invite && (
                  <button
                    type="button"
                    onClick={() => quitter(p)}
                    aria-label={`Retirer ${p.pseudo} de ce compte`}
                    className="absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-foreground/70 text-background shadow"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                )}
                {gerer && !invite && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPartage(p)}
                      aria-label={`Faire jouer ${p.pseudo} sur un autre compte`}
                      className="absolute -left-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow"
                    >
                      <Users className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => retirer(p)}
                      aria-label={`Effacer ${p.pseudo}`}
                      className="absolute -right-1.5 -top-1.5 grid h-7 w-7 place-items-center rounded-full bg-destructive text-white shadow"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setAjout(true)}
            className="flex min-w-[5.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border px-3 py-2.5 text-foreground/60 hover:bg-muted"
          >
            <Plus className="h-8 w-8" />
            <span className="text-sm font-bold">Ajouter</span>
          </button>
          {onRejoindre && (
            <button
              type="button"
              onClick={() => setRejoindre(true)}
              className="flex min-w-[5.5rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border px-3 py-2.5 text-foreground/60 hover:bg-muted"
            >
              <KeyRound className="h-8 w-8" />
              <span className="text-sm font-bold">Code famille</span>
            </button>
          )}
        </div>
      )}
      {attire && <p className="mt-3 text-sm font-bold text-primary">Touche ton prénom pour jouer.</p>}
      {gerer && profils.some((p) => !estPartage(p, userId)) && (
        <p className="mt-3 text-xs text-foreground/60">
          Bouton <Users className="mx-0.5 inline h-3.5 w-3.5" aria-label="famille" /> : faire jouer un enfant sur un autre compte (grand-mère, tante…).
        </p>
      )}
    </section>
  );
}
