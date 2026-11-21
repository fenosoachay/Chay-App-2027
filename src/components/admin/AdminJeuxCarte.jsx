import React, { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, ImagePlus, LayoutGrid, Loader2, Plus, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { THEMES } from "@/lib/memory";
import { definirMasque, lireMasques, lireThemesAdmin, MIN_CARTES } from "@/lib/jeuxEnfants";
import { uploadToBase44 } from "@/lib/upload";
import { confirmFr } from "@/lib/confirmFr";
import { useToast } from "@/components/ui/use-toast";

// Admin › Enfants › Jeux Carte (1.3.22) :
//  - catégories intégrées (10) : masquer / réafficher ;
//  - catégories de l'admin : nom + émoji, et leurs cartes (émoji OU image, nom, ce que la Bible en dit, référence).
// Une catégorie apparaît chez les enfants à partir de 6 cartes (Facile), 8 pour Moyen, 12 pour Difficile.
const champ = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const VIDE = { emoji: "", image_url: "", nom: "", info: "", ref: "" };

function NouvelleCarte({ theme, ordre, onAjoutee }) {
  const { toast } = useToast();
  const [c, setC] = useState(VIDE);
  const [envoi, setEnvoi] = useState(false);
  const [image, setImage] = useState(false);

  const choisirImage = async (file) => {
    if (!file) return;
    setImage(true);
    try {
      const url = await uploadToBase44(file);
      setC((x) => ({ ...x, image_url: url, emoji: "" }));
    } catch (e) {
      toast({ title: "Image non envoyée", description: e?.message, variant: "destructive" });
    } finally {
      setImage(false);
    }
  };

  const ajouter = async () => {
    if (!c.nom.trim() || (!c.emoji.trim() && !c.image_url)) {
      toast({ title: "Nom et émoji (ou image) requis", variant: "destructive" });
      return;
    }
    setEnvoi(true);
    try {
      await base44.entities.MemoryCarte.create({
        theme_id: theme.ligneId, emoji: c.emoji.trim(), image_url: c.image_url, nom: c.nom.trim(),
        info: c.info.trim(), ref: c.ref.trim(), ordre,
      });
      setC(VIDE);
      onAjoutee();
    } catch (e) {
      toast({ title: "Carte non ajoutée", description: e?.message, variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <p className="text-sm font-bold">Nouvelle carte</p>
      <div className="flex items-center gap-2">
        {c.image_url ? (
          <div className="relative">
            <img src={c.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
            <button type="button" onClick={() => setC((x) => ({ ...x, image_url: "" }))} aria-label="Retirer l'image" className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <input value={c.emoji} onChange={(e) => setC((x) => ({ ...x, emoji: e.target.value.slice(0, 16) }))} placeholder="🐑" className={`${champ} w-16 text-center text-xl`} aria-label="Émoji" />
        )}
        <span className="text-xs text-foreground/50">ou</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold">
          {image ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Image
          <input type="file" accept="image/*" className="hidden" disabled={image} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; choisirImage(f); }} />
        </label>
        <input value={c.nom} onChange={(e) => setC((x) => ({ ...x, nom: e.target.value.slice(0, 40) }))} placeholder="Nom (ex. La brebis)" className={champ} />
      </div>
      <input value={c.info} onChange={(e) => setC((x) => ({ ...x, info: e.target.value.slice(0, 300) }))} placeholder="Ce que la Bible en dit (affiché quand la paire est trouvée)" className={champ} />
      <div className="flex gap-2">
        <input value={c.ref} onChange={(e) => setC((x) => ({ ...x, ref: e.target.value.slice(0, 60) }))} placeholder="Référence (ex. Jean 10:11)" className={champ} />
        <button type="button" onClick={ajouter} disabled={envoi || image} className="inline-flex shrink-0 items-center gap-1.5 rounded-full brand-gradient px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter
        </button>
      </div>
    </div>
  );
}

function CategorieAdmin({ theme, onChange }) {
  const { toast } = useToast();
  const [ouverte, setOuverte] = useState(false);
  const n = theme.lignesCartes.length;
  const niveaux = n >= 12 ? "Facile, Moyen et Difficile" : n >= 8 ? "Facile et Moyen" : n >= MIN_CARTES ? "Facile" : null;

  const supprimerCarte = async (c) => {
    if (!(await confirmFr({ title: "Supprimer cette carte ?", message: c.nom, confirmLabel: "Supprimer" }))) return;
    await base44.entities.MemoryCarte.delete(c.id).catch((e) => toast({ title: "Non supprimée", description: e?.message, variant: "destructive" }));
    onChange();
  };
  const supprimerCategorie = async () => {
    if (!(await confirmFr({ title: "Supprimer cette catégorie ?", message: `${theme.titre} et ses ${n} carte(s).`, confirmLabel: "Supprimer" }))) return;
    try {
      for (const c of theme.lignesCartes) await base44.entities.MemoryCarte.delete(c.id);
      await base44.entities.MemoryTheme.delete(theme.ligneId);
    } catch (e) {
      toast({ title: "Suppression incomplète", description: e?.message, variant: "destructive" });
    }
    onChange();
  };
  const basculer = async () => {
    await base44.entities.MemoryTheme.update(theme.ligneId, { actif: !theme.actif }).catch(() => {});
    onChange();
  };

  return (
    <li className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={() => setOuverte((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="text-3xl" aria-hidden="true">{theme.emoji}</span>
          <span className="min-w-0">
            <span className="block truncate font-bold">{theme.titre}</span>
            <span className={`block text-xs ${niveaux ? "text-foreground/60" : "text-amber-600 dark:text-amber-400"}`}>
              {n} carte(s) · {niveaux ? `Niveaux : ${niveaux}` : `Encore ${MIN_CARTES - n} carte(s) pour apparaître`}
            </span>
          </span>
        </button>
        <button type="button" onClick={basculer} aria-label={theme.actif ? "Masquer" : "Afficher"} className="grid h-9 w-9 place-items-center rounded-full border border-border">
          {theme.actif ? <Eye className="h-4 w-4 text-emerald-500" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button type="button" onClick={supprimerCategorie} aria-label="Supprimer la catégorie" className="grid h-9 w-9 place-items-center rounded-full border border-border text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {ouverte && (
        <div className="space-y-2 border-t border-border p-3">
          {theme.lignesCartes.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-muted/50 p-2">
              {c.image_url ? <img src={c.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="w-10 text-center text-2xl">{c.emoji}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{c.nom}</span>
                <span className="block truncate text-xs text-foreground/60">{c.info}{c.ref ? ` (${c.ref})` : ""}</span>
              </span>
              <button type="button" onClick={() => supprimerCarte(c)} aria-label="Supprimer la carte" className="grid h-8 w-8 place-items-center rounded-full text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <NouvelleCarte theme={theme} ordre={n} onAjoutee={onChange} />
        </div>
      )}
    </li>
  );
}

export default function AdminJeuxCarte() {
  const { toast } = useToast();
  const [masques, setMasques] = useState(null);
  const [themes, setThemes] = useState(null);
  const [nouveau, setNouveau] = useState({ titre: "", emoji: "" });

  const charger = useCallback(() => {
    lireMasques("memory").then(setMasques).catch(() => setMasques(new Set()));
    lireThemesAdmin({ seulementActives: false }).then(setThemes).catch(() => setThemes([]));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const basculerIntegre = async (id) => {
    const cache = !masques.has(id);
    try {
      await definirMasque("memory", id, cache);
      setMasques((m) => { const x = new Set(m); if (cache) x.add(id); else x.delete(id); return x; });
    } catch (e) {
      toast({ title: "Non enregistré", description: e?.message, variant: "destructive" });
    }
  };

  const creer = async () => {
    if (!nouveau.titre.trim()) { toast({ title: "Nom de la catégorie requis", variant: "destructive" }); return; }
    try {
      await base44.entities.MemoryTheme.create({ titre: nouveau.titre.trim(), emoji: nouveau.emoji.trim() || "🃏", ordre: (themes || []).length, actif: true });
      setNouveau({ titre: "", emoji: "" });
      charger();
    } catch (e) {
      toast({ title: "Catégorie non créée", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <section className="space-y-6 rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="flex items-center gap-2">
        <LayoutGrid className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-extrabold">Jeux Carte</h2>
      </div>

      <div>
        <p className="font-bold">Catégories intégrées</p>
        <p className="mb-3 text-sm text-foreground/60">Touchez une catégorie pour la masquer ou la réafficher chez les enfants.</p>
        {masques === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {THEMES.map((t) => {
              const cache = masques.has(t.id);
              return (
                <button key={t.id} type="button" onClick={() => basculerIntegre(t.id)} className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-sm font-semibold ${cache ? "border-dashed border-border opacity-50" : "border-border bg-card"}`}>
                  <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                  <span className="min-w-0 flex-1 leading-tight">{t.titre}</span>
                  {cache ? <EyeOff className="h-4 w-4 shrink-0" /> : <Eye className="h-4 w-4 shrink-0 text-emerald-500" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="font-bold">Vos catégories</p>
        <p className="mb-3 text-sm text-foreground/60">
          Une catégorie apparaît chez les enfants à partir de {MIN_CARTES} cartes (Facile) ; 8 pour Moyen, 12 pour Difficile.
        </p>
        <div className="mb-3 flex gap-2">
          <input value={nouveau.emoji} onChange={(e) => setNouveau((x) => ({ ...x, emoji: e.target.value.slice(0, 16) }))} placeholder="🌈" aria-label="Émoji de la catégorie" className={`${champ} w-16 text-center text-xl`} />
          <input value={nouveau.titre} onChange={(e) => setNouveau((x) => ({ ...x, titre: e.target.value.slice(0, 60) }))} placeholder="Nom de la nouvelle catégorie" className={champ} />
          <button type="button" onClick={creer} className="inline-flex shrink-0 items-center gap-1.5 rounded-full brand-gradient px-4 py-2 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> Créer
          </button>
        </div>
        {themes === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : themes.length === 0 ? (
          <p className="text-sm text-foreground/50">Aucune catégorie pour l'instant.</p>
        ) : (
          <ul className="space-y-2">
            {themes.map((t) => <CategorieAdmin key={t.ligneId} theme={t} onChange={charger} />)}
          </ul>
        )}
      </div>
    </section>
  );
}
