import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Film, Image as ImageIcon, Loader2, Pencil, Plus, Trash2, Type, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { uploadToBase44 } from "@/lib/upload";
import { confirmFr } from "@/lib/confirmFr";
import { histoireValide, videoLisiblePartout } from "@/lib/petiteHistoire";

// Admin › Application › Contenu › Accueil › « Petite histoire » (1.3.25) : pop-up occasionnel, sans lien avec le
// verset du jour. Une histoire « en ligne » s'ouvre à l'ouverture de l'app chez chaque membre jusqu'à ce qu'il
// touche « Ok ». Vidéo (tous formats), photo ou texte ; description facultative pour la vidéo et la photo.
const TYPES = [
  { value: "video", label: "Vidéo", icon: Film },
  { value: "photo", label: "Photo", icon: ImageIcon },
  { value: "texte", label: "Texte", icon: Type },
];
const VIDE = { id: null, type: "video", titre: "", media_url: "", description: "", texte: "", actif: true };
const ACCEPT_VIDEO = "video/*,.mp4,.m4v,.mov,.webm,.mkv,.3gp,.3g2,.avi,.wmv,.asf,.flv,.mpeg,.mpg,.ts,.mts,.m2ts";

const formatDate = (iso) => {
  const d = new Date(String(iso || "").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

function Formulaire({ depart, onFini }) {
  const { toast } = useToast();
  const [f, setF] = useState(depart);
  const [envoi, setEnvoi] = useState(null); // pourcentage pendant l'envoi du fichier
  const [illisible, setIllisible] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const maj = (champ, valeur) => setF((x) => ({ ...x, [champ]: valeur }));

  const envoyerFichier = async (file) => {
    if (!file) return;
    setIllisible(false);
    setEnvoi(0);
    try {
      const url = await uploadToBase44(file, { onProgress: (p) => setEnvoi(Math.round(Number(p) || 0)) });
      maj("media_url", url);
    } catch (e) {
      toast({ title: "Fichier non envoyé", description: e?.message, variant: "destructive" });
    } finally {
      setEnvoi(null);
    }
  };

  const enregistrer = async () => {
    const donnees = {
      type: f.type,
      titre: f.titre.trim(),
      media_url: f.type === "texte" ? "" : f.media_url.trim(),
      description: f.type === "texte" ? "" : f.description.trim(),
      texte: f.type === "texte" ? f.texte.trim() : "",
      actif: Boolean(f.actif),
    };
    if (!histoireValide({ ...donnees, actif: true })) {
      toast({ title: f.type === "texte" ? "Écrivez le texte de l'histoire" : "Ajoutez le fichier de l'histoire", variant: "destructive" });
      return;
    }
    setEnregistrement(true);
    try {
      if (f.id) await base44.entities.PetiteHistoire.update(f.id, donnees);
      else await base44.entities.PetiteHistoire.create(donnees);
      toast({ title: "Enregistré", description: donnees.actif ? "Les membres la verront à la prochaine ouverture de l'app." : "Enregistrée hors ligne : les membres ne la voient pas." });
      onFini(true);
    } catch (e) {
      toast({ title: "Non enregistré", description: e?.message, variant: "destructive" });
    } finally {
      setEnregistrement(false);
    }
  };

  const avertissementFormat = f.type === "video" && f.media_url && (illisible || !videoLisiblePartout(f.media_url));

  return (
    <div className="space-y-4 rounded-2xl border border-primary/40 bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {TYPES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setF((x) => ({ ...x, type: value, media_url: value === x.type ? x.media_url : "" }))}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${f.type === value ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <input
        value={f.titre}
        onChange={(e) => maj("titre", e.target.value)}
        maxLength={200}
        placeholder="Titre (facultatif)"
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
      />

      {f.type === "texte" ? (
        <textarea
          value={f.texte}
          onChange={(e) => maj("texte", e.target.value)}
          rows={8}
          placeholder="Il était une fois…"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
        />
      ) : (
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold">
            {envoi !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {envoi !== null ? `Envoi… ${envoi} %` : f.media_url ? "Remplacer le fichier" : f.type === "video" ? "Choisir la vidéo" : "Choisir la photo"}
            <input
              type="file"
              accept={f.type === "video" ? ACCEPT_VIDEO : "image/*"}
              className="hidden"
              disabled={envoi !== null}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; envoyerFichier(file); }}
            />
          </label>
          {f.type === "video" && <p className="text-xs text-foreground/50">Tous les formats sont acceptés (mp4, mov, avi, mkv, wmv…).</p>}
          {f.media_url && envoi === null && (
            f.type === "video"
              ? <video src={f.media_url} controls playsInline preload="metadata" onError={() => setIllisible(true)} className="max-h-56 w-full rounded-xl bg-black" />
              : <img src={f.media_url} alt="" className="max-h-56 rounded-xl object-contain" />
          )}
          {avertissementFormat && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Ce format risque de ne pas se lire sur tous les téléphones. Pour être sûr, envoyez plutôt la vidéo en MP4.
            </p>
          )}
          <textarea
            value={f.description}
            onChange={(e) => maj("description", e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="Description (facultatif)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={f.actif} onChange={(e) => maj("actif", e.target.checked)} className="h-4 w-4" />
        En ligne (s'ouvre chez les membres)
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={enregistrer}
          disabled={enregistrement || envoi !== null}
          className="inline-flex items-center gap-2 rounded-full brand-gradient px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {enregistrement && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
        </button>
        <button type="button" onClick={() => onFini(false)} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold">
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function AdminPetiteHistoire() {
  const { toast } = useToast();
  const [liste, setListe] = useState(null);
  const [edition, setEdition] = useState(null);

  const charger = useCallback(() => {
    base44.entities.PetiteHistoire.list("-created", 100)
      .then((rows) => setListe(Array.isArray(rows) ? rows : []))
      .catch(() => setListe([]));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const basculer = async (h) => {
    try {
      await base44.entities.PetiteHistoire.update(h.id, { actif: !h.actif });
      charger();
    } catch (e) {
      toast({ title: "Non enregistré", description: e?.message, variant: "destructive" });
    }
  };
  const supprimer = async (h) => {
    if (!(await confirmFr("Supprimer cette petite histoire ?"))) return;
    try {
      await base44.entities.PetiteHistoire.delete(h.id);
      charger();
    } catch (e) {
      toast({ title: "Non supprimé", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Une histoire en ligne s'ouvre à l'ouverture de l'app chez chaque membre, jusqu'à ce qu'il touche « Ok ».
        Si plusieurs sont en ligne, la plus récente passe en premier.
      </p>
      {edition ? (
        <Formulaire depart={edition} onFini={(change) => { setEdition(null); if (change) charger(); }} />
      ) : (
        <button type="button" onClick={() => setEdition({ ...VIDE })} className="inline-flex items-center gap-2 rounded-full brand-gradient px-5 py-2.5 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> Nouvelle petite histoire
        </button>
      )}

      {liste === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : liste.length === 0 ? (
        <p className="py-6 text-sm text-foreground/50">Aucune petite histoire pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {liste.map((h) => {
            const T = TYPES.find((t) => t.value === h.type) || TYPES[2];
            return (
              <li key={h.id} className={`flex items-center gap-3 rounded-2xl border bg-card p-3 ${h.actif ? "border-primary/40" : "border-border opacity-70"}`}>
                {h.type === "photo" && h.media_url ? (
                  <img src={h.media_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted"><T.icon className="h-5 w-5 text-primary" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{h.titre || (h.type === "texte" ? String(h.texte || "").slice(0, 60) : T.label)}</p>
                  <p className="text-xs text-foreground/50">{T.label} · {formatDate(h.created || h.created_date)} · {h.actif ? "En ligne" : "Hors ligne"}</p>
                </div>
                <button type="button" onClick={() => basculer(h)} title={h.actif ? "Mettre hors ligne" : "Mettre en ligne"} className="grid h-9 w-9 place-items-center rounded-full border border-border">
                  {h.actif ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => setEdition({ ...VIDE, ...h, titre: h.titre || "", media_url: h.media_url || "", description: h.description || "", texte: h.texte || "" })} title="Modifier" className="grid h-9 w-9 place-items-center rounded-full border border-border">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => supprimer(h)} title="Supprimer" className="grid h-9 w-9 place-items-center rounded-full border border-red-200 text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
