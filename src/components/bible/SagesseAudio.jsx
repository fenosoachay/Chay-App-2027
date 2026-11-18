import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Headphones, Loader2, Pause, Play, Settings2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useAudioPlayer } from "@/lib/AudioPlayerContext";
import { useToast } from "@/components/ui/use-toast";
import { confirmFr } from "@/lib/confirmFr";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { envoyerAudioBible } from "@/lib/upload";
import { LIVRES_SAGESSE, audiosParChapitre, fileSagesse, livreSagesse } from "@/lib/sagesseAudio";

/** Durée (secondes) d'un fichier audio choisi par l'admin, ou null si le navigateur ne la lit pas. */
function lireDuree(file) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const fin = (v) => { clearTimeout(t); URL.revokeObjectURL(url); ok(v); };
    const t = setTimeout(() => fin(null), 10000);
    a.preload = "metadata";
    a.onloadedmetadata = () => fin(Number.isFinite(a.duration) ? Math.round(a.duration) : null);
    a.onerror = () => fin(null);
    a.src = url;
  });
}

/** Petites barres animées : chapitre en cours de lecture. */
function Egaliseur() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-current"
          style={{ height: "100%", animation: `radio-bar ${0.6 + i * 0.18}s ease-in-out ${i * 0.12}s infinite` }}
        />
      ))}
    </span>
  );
}

// Bible › « Sagesse en audio » : Proverbes et Ecclésiaste ; chaque chapitre est un carré numéroté. Toucher un carré
// lit l'audio du chapitre dans le lecteur global (lecture, pause, chapitre suivant, notification média).
// Membres : écoute seulement. Admins : « Gérer les audios » puis toucher un carré pour ajouter ou remplacer
// l'audio (envoyé sur R2, rangé par livre et chapitre).
export default function SagesseAudio({ onBack }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();
  const { currentTrack, isPlaying, playQueue, toggle } = useAudioPlayer();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const livre = livreSagesse(searchParams.get("livre"));
  const chapitreCible = Number(searchParams.get("chapitre")) || null;
  const [rows, setRows] = useState(null);
  const [gestion, setGestion] = useState(false);
  const [envoi, setEnvoi] = useState(null); // { chapitre, pct }
  const fichierRef = useRef(null);
  const chapitreEnvoiRef = useRef(null);
  const carres = useRef(new Map());

  const charger = () => base44.entities.BibleAudio.list("chapter", 500)
    .then((r) => setRows(Array.isArray(r) ? r : []))
    .catch(() => setRows([]));
  useEffect(() => { charger(); }, []);

  // Lien direct ou notification de lecture : le carré du chapitre est montré.
  useEffect(() => {
    if (!livre || !chapitreCible || !rows) return;
    carres.current.get(chapitreCible)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [livre, chapitreCible, rows]);

  const audios = useMemo(() => (livre ? audiosParChapitre(rows, livre.id) : new Map()), [rows, livre]);
  const file = useMemo(() => (livre ? fileSagesse(livre.id, rows) : []), [rows, livre]);
  const enCours = currentTrack?.mediaType === "bible" && currentTrack?.livre === livre?.id ? currentTrack.chapitre : null;

  // Livre ouvert depuis la liste : nouvelle entrée d'historique (le retour du téléphone revient à la liste).
  const ouvrirLivre = (id) => setSearchParams({ view: "sagesse", livre: id }, { state: { chayBibleLivre: true } });
  const retour = () => {
    if (!livre) onBack?.();
    else if (hasNavigationOrigin(window.history.state, "chayBibleLivre")) navigate(-1);
    else setSearchParams({ view: "sagesse" }, { replace: true });
  };

  const ecouter = (chapitre) => {
    if (enCours === chapitre) { toggle(); return; }
    const i = file.findIndex((t) => t.chapitre === chapitre);
    if (i >= 0) playQueue(file, i);
  };

  const choisirFichier = (chapitre) => {
    chapitreEnvoiRef.current = chapitre;
    fichierRef.current?.click();
  };

  const envoyer = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const chapitre = chapitreEnvoiRef.current;
    if (!f || !livre || !chapitre) return;
    const existant = audios.get(chapitre);
    if (existant && !(await confirmFr({
      title: `Remplacer ${livre.nom} ${chapitre} ?`,
      message: "L'audio actuel de ce chapitre sera remplacé pour tous les membres.",
      confirmLabel: "Remplacer",
    }))) return;
    setEnvoi({ chapitre, pct: 0 });
    try {
      const [audio_url, duration] = await Promise.all([
        envoyerAudioBible(f, { livre: livre.id, chapitre, onProgress: (pct) => setEnvoi({ chapitre, pct }) }),
        lireDuree(f),
      ]);
      const data = { book: livre.id, chapter: chapitre, audio_url, duration: duration ?? null, size: f.size };
      if (existant) await base44.entities.BibleAudio.update(existant.id, data);
      else await base44.entities.BibleAudio.create(data);
      toast({ title: `${livre.nom} ${chapitre} : audio ${existant ? "remplacé" : "ajouté"}` });
      await charger();
    } catch (err) {
      toast({ title: "Envoi impossible", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setEnvoi(null);
    }
  };

  const enTete = (titre, sousTitre) => (
    <header className="mb-5 flex items-center gap-3">
      <button
        type="button"
        onClick={retour}
        aria-label="Retour"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold leading-tight">{titre}</h1>
        {sousTitre && <p className="text-sm text-muted-foreground">{sousTitre}</p>}
      </div>
    </header>
  );

  // ── Choix du livre ──
  if (!livre) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-4 md:px-8 md:py-10">
        {enTete("Sagesse en audio", "Écoutez les Proverbes, l'Ecclésiaste et Hébreux")}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LIVRES_SAGESSE.map((l) => {
            const n = rows ? audiosParChapitre(rows, l.id).size : null;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => ouvrirLivre(l.id)}
                className="group flex items-center gap-4 rounded-[1.5rem] border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl brand-gradient text-white shadow-sm">
                  <Headphones className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-xl font-extrabold">{l.nom}</span>
                  <span className="block text-sm text-muted-foreground">
                    {n === null ? `${l.chapitres} chapitres` : `${n} / ${l.chapitres} chapitres en audio`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </main>
    );
  }

  // ── Grille des chapitres ──
  const chapitres = Array.from({ length: livre.chapitres }, (_, i) => i + 1);
  return (
    <main className="mx-auto max-w-3xl px-4 py-4 md:px-8 md:py-10">
      {enTete(livre.nom, rows ? `${audios.size} / ${livre.chapitres} chapitres en audio` : null)}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {file.length > 0 && (
          <button
            type="button"
            onClick={() => playQueue(file, 0)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm"
          >
            <Play className="h-4 w-4" aria-hidden="true" /> Tout écouter
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            aria-pressed={gestion}
            onClick={() => setGestion((g) => !g)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold ${gestion ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" /> {gestion ? "Terminer" : "Gérer les audios"}
          </button>
        )}
      </div>
      {gestion && (
        <p role="status" className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
          Touchez un chapitre pour ajouter ou remplacer son audio (mp3, envoyé sur le stockage R2).
        </p>
      )}

      {rows === null ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(3.5rem,calc((100%-1.5rem)/4)),1fr))] gap-2" aria-label={`Chapitres de ${livre.nom}`}>
          {chapitres.map((c) => {
            const dispo = audios.has(c);
            const actif = enCours === c;
            const joue = actif && isPlaying;
            const enEnvoi = envoi?.chapitre === c;
            const cible = chapitreCible === c && !actif;
            const etat = joue ? "en lecture" : actif ? "en pause" : dispo ? "écouter" : "audio pas encore disponible";
            const cls = actif
              ? "brand-gradient text-white shadow-md scale-[1.04]"
              : dispo
                ? "border border-border bg-card text-foreground hover:border-primary hover:bg-primary/5"
                : "border border-dashed border-border/70 bg-transparent text-foreground/35";
            return (
              <li key={c} ref={(n) => { if (n) carres.current.set(c, n); else carres.current.delete(c); }}>
                <button
                  type="button"
                  disabled={(!dispo && !gestion) || Boolean(envoi)}
                  onClick={() => (gestion ? choisirFichier(c) : ecouter(c))}
                  aria-label={`${livre.nom} ${c}, ${gestion ? (dispo ? "remplacer l'audio" : "ajouter l'audio") : etat}`}
                  aria-current={actif ? "true" : undefined}
                  className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-[22%] text-lg font-extrabold tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default ${cls} ${cible ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                >
                  {enEnvoi ? (
                    <span className="text-xs font-bold">{envoi.pct}%</span>
                  ) : (
                    <>
                      <span>{c}</span>
                      {actif && (joue ? <Egaliseur /> : <Pause className="h-3 w-3" aria-hidden="true" />)}
                      {gestion && <Upload className="absolute right-1 top-1 h-3 w-3 opacity-60" aria-hidden="true" />}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <input ref={fichierRef} type="file" accept="audio/mpeg,audio/*,.mp3" className="hidden" onChange={envoyer} aria-hidden="true" tabIndex={-1} />
    </main>
  );
}
