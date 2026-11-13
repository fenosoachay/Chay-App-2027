import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Gamepad2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { JEUX, categoriesJeux, classementParJeu, grouperJeux } from "@/lib/jeuxCategories";

/** Catégories, classements (lignes) : chargés ensemble. Exporté pour le tableau de bord. */
export async function chargerClassementJeux(entities) {
  const [cats, cls] = await Promise.all([
    entities.GameCategory.list("order", 10),
    entities.GameClassement.list("-created_date", 500),
  ]);
  return { cats: Array.isArray(cats) ? cats : [], cls: Array.isArray(cls) ? cls : [] };
}

// Tableau de bord : une demande de classement pour CHAQUE jeu non classé (invisible des membres tant qu'il l'est).
export function AlerteJeuxNonClasses({ onNavigate }) {
  const [nonClasses, setNonClasses] = useState([]);
  useEffect(() => {
    let actif = true;
    chargerClassementJeux(base44.entities)
      .then(({ cats, cls }) => { if (actif) setNonClasses(grouperJeux(cats, cls).nonClasses); })
      .catch(() => {});
    return () => { actif = false; };
  }, []);
  if (!nonClasses.length) return null;
  return (
    <section role="status" className="mt-6 rounded-[1.5rem] border border-amber-500/40 bg-amber-500/10 p-5">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
        <h3 className="font-display text-lg font-extrabold">
          {nonClasses.length} jeu{nonClasses.length > 1 ? "x" : ""} à classer
        </h3>
      </div>
      <p className="mb-3 text-sm text-foreground/60">
        Un jeu non classé n'est pas visible des membres. Choisissez sa catégorie.
      </p>
      <ul className="space-y-2">
        {nonClasses.map((j) => (
          <li key={j.id}>
            <button
              type="button"
              onClick={() => onNavigate?.("game_categories")}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 text-left font-bold"
            >
              <span>Classer « {j.name} »</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Panneau admin › Jeux › Catégories des jeux : noms des deux catégories et catégorie de chaque jeu.
export default function JeuxCategoriesAdmin() {
  const { toast } = useToast();
  const [donnees, setDonnees] = useState(null);
  const [noms, setNoms] = useState({});
  const [occupe, setOccupe] = useState(null);

  const charger = async () => {
    try {
      const d = await chargerClassementJeux(base44.entities);
      setDonnees(d);
      setNoms(Object.fromEntries(categoriesJeux(d.cats).map((c) => [c.slot, c.name])));
    } catch (e) {
      setDonnees({ erreur: e?.message || "Chargement impossible" });
    }
  };
  useEffect(() => { charger(); }, []);

  if (!donnees) return <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>;
  if (donnees.erreur) {
    return <p role="alert" className="text-destructive">Catégories des jeux indisponibles : {donnees.erreur}. La migration du lot E a-t-elle été appliquée ?</p>;
  }

  const cats = categoriesJeux(donnees.cats);
  const parJeu = classementParJeu(donnees.cls);
  const lignes = new Map(donnees.cls.map((c) => [c.game_id, c]));

  const renommer = async (c) => {
    const name = String(noms[c.slot] || "").trim();
    if (!name || name === c.name) return;
    if (!c.id) { toast({ title: "Catégorie absente : appliquez la migration du lot E", variant: "destructive" }); return; }
    setOccupe(`nom-${c.slot}`);
    try {
      await base44.entities.GameCategory.update(c.id, { name: name.slice(0, 60) });
      toast({ title: `Catégorie renommée : ${name}` });
      await charger();
    } catch (e) {
      toast({ title: "Nom non enregistré", description: e?.message, variant: "destructive" });
    } finally {
      setOccupe(null);
    }
  };

  const classer = async (jeu, slot) => {
    setOccupe(jeu.id);
    try {
      const ligne = lignes.get(jeu.id);
      if (!slot) { if (ligne) await base44.entities.GameClassement.delete(ligne.id); }
      else if (ligne) await base44.entities.GameClassement.update(ligne.id, { slot });
      else await base44.entities.GameClassement.create({ game_id: jeu.id, slot });
      await charger();
    } catch (e) {
      toast({ title: "Classement non enregistré", description: e?.message, variant: "destructive" });
    } finally {
      setOccupe(null);
    }
  };

  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Gamepad2 className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 className="font-display text-xl font-extrabold">Catégories des jeux</h2>
      </div>

      <h3 className="mb-2 font-bold">Noms des catégories</h3>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cats.map((c) => (
          <form
            key={c.slot}
            onSubmit={(e) => { e.preventDefault(); renommer(c); }}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3"
          >
            <input
              value={noms[c.slot] ?? ""}
              onChange={(e) => setNoms((n) => ({ ...n, [c.slot]: e.target.value }))}
              maxLength={60}
              required
              aria-label={`Nom de la catégorie ${c.name}`}
              className="min-w-0 flex-1 basis-full sm:basis-40 rounded-xl border border-input bg-background px-3 py-2 font-semibold"
            />
            <button
              type="submit"
              disabled={occupe === `nom-${c.slot}` || !String(noms[c.slot] || "").trim() || String(noms[c.slot]).trim() === c.name}
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Enregistrer
            </button>
          </form>
        ))}
      </div>

      <h3 className="mb-1 font-bold">Catégorie de chaque jeu</h3>
      <p className="mb-3 text-sm text-foreground/60">Un jeu appartient à une seule catégorie. « Non classé » : invisible des membres.</p>
      <ul className="space-y-2">
        {JEUX.map((j) => {
          const slot = parJeu.get(j.id) || "";
          return (
            <li key={j.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 ${slot ? "border-border bg-card" : "border-amber-500/50 bg-amber-500/10"}`}>
              <span className="font-bold">
                {j.name}
                {!slot && <span className="ml-2 text-xs font-semibold text-amber-700 dark:text-amber-400">à classer</span>}
              </span>
              <select
                value={slot}
                disabled={occupe === j.id}
                onChange={(e) => classer(j, e.target.value)}
                aria-label={`Catégorie du jeu ${j.name}`}
                className="min-w-0 max-w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold"
              >
                <option value="">Non classé</option>
                {cats.map((c) => <option key={c.slot} value={c.slot}>{c.name}</option>)}
              </select>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
