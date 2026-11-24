import React, { useState } from "react";
import { ListPlus, Loader2, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getLocalBooks, getLocalChapterVerses } from "@/lib/localBible";
import { formatISODate } from "@/lib/localDate";
import { MAX_VERSETS, analyserReference, joursLibres, lireLignes, textePassage } from "@/lib/versetsEnMasse";

// Versets du jour en masse (1.3.27) : l'admin colle jusqu'à 50 références ; l'app trouve le texte (Louis
// Segond), donne un jour à chacun à partir de la date choisie (jours déjà programmés sautés), et tout reste
// modifiable avant d'être mis dans la liste « à publier ». Ensuite, chaque jour se modifie comme avant.
export default function ImportVersets({ depart: departInitial, occupes, onAjouter }) {
  const [texte, setTexte] = useState("");
  const [depart, setDepart] = useState(departInitial);
  const [lignes, setLignes] = useState(null); // [{ cle, ref, verse_text, reading_date, erreur }]
  const [enTrop, setEnTrop] = useState(0);
  const [preparation, setPreparation] = useState(false);

  const preparer = async () => {
    setPreparation(true);
    try {
      const { lignes: brutes, enTrop: surplus } = lireLignes(texte);
      setEnTrop(surplus);
      const books = await getLocalBooks("fr");
      const lues = brutes.map((l) => ({ brute: l, r: analyserReference(l, books) }));
      const jours = joursLibres(depart, lues.filter((x) => x.r).length, occupes);
      let j = 0;
      const out = [];
      for (const [i, { brute, r }] of lues.entries()) {
        if (!r) {
          out.push({ cle: `l${i}`, ref: brute, verse_text: "", reading_date: "", erreur: "Référence non reconnue (ex. : Jean 3:16)." });
          continue;
        }
        const versets = await getLocalChapterVerses("fr", r.bookId, r.chapitre).catch(() => []);
        const t = textePassage(versets, r.debut, r.fin);
        out.push({ cle: `l${i}`, ref: r.ref, verse_text: t, reading_date: jours[j] || "", erreur: t ? "" : "Verset introuvable : écris le texte toi-même." });
        j += 1;
      }
      setLignes(out);
    } finally {
      setPreparation(false);
    }
  };

  const changer = (cle, champ, valeur) =>
    setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, [champ]: valeur, ...(champ === "verse_text" && valeur.trim() ? { erreur: "" } : {}) } : x)));
  const retirer = (cle) => setLignes((l) => l.filter((x) => x.cle !== cle));

  const prets = (lignes || []).filter((x) => x.reading_date && x.verse_text.trim() && !x.erreur);
  const ajouter = () => {
    onAjouter(prets.map((x) => ({ id: undefined, scripture_reference: x.ref, verse_text: x.verse_text.trim(), reading_date: x.reading_date })));
    setLignes(null);
    setTexte("");
  };

  if (!lignes) {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="vm-refs">Références, une par ligne ({MAX_VERSETS} au plus)</Label>
          <Textarea
            id="vm-refs"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={8}
            placeholder={"Jean 3:16\nPhilippiens 4:13\nPsaume 23:1-3\n…"}
            className="selectable font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Le texte de chaque verset est pris dans la Bible Louis Segond de l'app ; tu pourras le corriger.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vm-depart">À partir du</Label>
          <Input id="vm-depart" type="date" value={depart} onChange={(e) => setDepart(e.target.value)} className="selectable" />
          <p className="text-xs text-muted-foreground">Un verset par jour, à la suite. Les jours déjà programmés sont sautés.</p>
        </div>
        <Button onClick={preparer} disabled={!texte.trim() || !depart || preparation} className="w-full">
          {preparation ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
          Préparer les versets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">
        {prets.length} verset{prets.length > 1 ? "s" : ""} prêt{prets.length > 1 ? "s" : ""}
        {lignes.length > prets.length ? ` · ${lignes.length - prets.length} à corriger` : ""}
        {enTrop ? ` · ${enTrop} ligne(s) au-delà de ${MAX_VERSETS} ignorée(s)` : ""}
      </p>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
        {lignes.map((x) => (
          <div key={x.cle} className={`rounded-xl border p-2.5 ${x.erreur ? "border-destructive/60 bg-destructive/5" : "border-border bg-card"}`}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{x.ref}</span>
              <span className="shrink-0 text-xs text-foreground/60">{x.reading_date ? formatISODate(x.reading_date) : "sans date"}</span>
              <button type="button" onClick={() => retirer(x.cle)} aria-label={`Retirer ${x.ref}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-foreground/50 hover:bg-muted">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {x.reading_date ? (
              <Textarea value={x.verse_text} onChange={(e) => changer(x.cle, "verse_text", e.target.value)} rows={2} className="selectable text-sm" />
            ) : null}
            {x.erreur && <p className="mt-1 text-xs text-destructive">{x.erreur}</p>}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setLignes(null)} className="flex-1">Modifier la liste</Button>
        <Button onClick={ajouter} disabled={!prets.length} className="flex-1">
          <ListPlus className="mr-1.5 h-4 w-4" /> Ajouter ({prets.length})
        </Button>
      </div>
    </div>
  );
}
