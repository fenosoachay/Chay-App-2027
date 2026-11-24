import React, { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, Images, Loader2, PaintBucket, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import { useToast } from "@/components/ui/use-toast";
import { confirmFr } from "@/lib/confirmFr";
import { COTE, PALETTE, enregistrerDessin, masqueTraits, remplir, versDessin } from "@/lib/coloriage";
import { enregistrerImageGalerie } from "@/lib/fondsEcran";

// Atelier de coloriage : l'enfant touche une zone pour la remplir (seau), ou dessine librement (pinceau),
// gomme. Les traits du dessin restent toujours par-dessus.
// 1.3.26 : deux boutons bien différents en haut à gauche, avec leur nom écrit dessous :
//  - « Images » (vignettes) : retour à la liste des images ;
//  - « Annuler » (flèche courbe) : enlève la dernière couleur.
// Le retour du téléphone revient TOUJOURS à la liste des images, sans question : le dessin commencé est gardé
// tout seul dans « Mes dessins » (le même dessin est mis à jour, jamais en double), pour le continuer plus tard.
// « Enregistrer » le met aussi dans la galerie du téléphone.
// source : { id, titre, svg } (dessin intégré) ou { id, titre, image_url } (coloriage ajouté par l'admin).
// reprise : dessin de « Mes dessins » à continuer ({ id, couleurs: Blob }).

const TAILLES = [{ id: "petit", px: 10 }, { id: "moyen", px: 24 }, { id: "gros", px: 48 }];
const HISTORIQUE_MAX = 10;

function chargerImage(src) {
  return new Promise((ok, ko) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => ok(im);
    im.onerror = () => ko(new Error("Image illisible"));
    im.src = src;
  });
}

/** Dessin source -> image affichable (SVG intégré, ou image de l'admin chargée sans « salir » le canvas). */
async function imageSource(source) {
  if (source.svg) {
    const url = URL.createObjectURL(new Blob([source.svg], { type: "image/svg+xml" }));
    try { return await chargerImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const r = await fetch(source.image_url, { mode: "cors" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return createImageBitmap(await r.blob());
}

export default function AtelierColoriage({ source, reprise, onClose }) {
  const { toast } = useToast();
  const ecranRef = useRef(null);
  const couleursRef = useRef(null); // couche de couleurs (hors écran)
  const traitsRef = useRef(null); // traits du dessin (hors écran)
  const masqueRef = useRef(null);
  const historique = useRef([]);
  const trace = useRef(null); // pinceau en cours
  const modifie = useRef(false);
  const idDessin = useRef(reprise?.id || `d-${Date.now()}`);
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState("");
  const [outil, setOutil] = useState("remplir");
  const [couleur, setCouleur] = useState(PALETTE[0]);
  const [taille, setTaille] = useState(TAILLES[1].px);
  const [nbAnnuler, setNbAnnuler] = useState(0);
  const [occupe, setOccupe] = useState(false);
  // Taille affichée du dessin : le plus grand carré qui tient dans l'espace disponible.
  const zoneRef = useRef(null);
  const [cote, setCote] = useState(0);
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return undefined;
    const mesurer = () => setCote(Math.max(0, Math.floor(Math.min(el.clientWidth - 16, el.clientHeight - 8))));
    mesurer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const afficher = useCallback(() => {
    const ctx = ecranRef.current?.getContext("2d");
    if (!ctx || !couleursRef.current || !traitsRef.current) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(couleursRef.current, 0, 0);
    ctx.globalCompositeOperation = "multiply"; // fond blanc des traits invisible, traits noirs par-dessus
    ctx.drawImage(traitsRef.current, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }, []);

  // Préparation : traits (dessin centré), masque des traits, couleurs (blanc, ou dessin repris).
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const im = await imageSource(source);
        if (!vivant) return;
        const traits = document.createElement("canvas");
        traits.width = COTE;
        traits.height = COTE;
        const t = traits.getContext("2d", { willReadFrequently: true });
        t.fillStyle = "#fff";
        t.fillRect(0, 0, COTE, COTE);
        const w = im.width || im.naturalWidth;
        const h = im.height || im.naturalHeight;
        const e = Math.min(COTE / w, COTE / h);
        t.drawImage(im, (COTE - w * e) / 2, (COTE - h * e) / 2, w * e, h * e);
        masqueRef.current = masqueTraits(t.getImageData(0, 0, COTE, COTE).data);
        traitsRef.current = traits;

        const couleurs = document.createElement("canvas");
        couleurs.width = COTE;
        couleurs.height = COTE;
        const c = couleurs.getContext("2d", { willReadFrequently: true });
        c.fillStyle = "#fff";
        c.fillRect(0, 0, COTE, COTE);
        if (reprise?.couleurs) {
          const bmp = await createImageBitmap(reprise.couleurs);
          c.drawImage(bmp, 0, 0, COTE, COTE);
          bmp.close?.();
        }
        couleursRef.current = couleurs;
        if (!vivant) return;
        setPret(true);
        requestAnimationFrame(afficher);
      } catch {
        if (vivant) setErreur("Ce coloriage ne peut pas s'ouvrir pour le moment.");
      }
    })();
    return () => { vivant = false; };
  }, [source, reprise, afficher]);

  const memoriser = () => {
    const c = couleursRef.current.getContext("2d");
    historique.current.push(c.getImageData(0, 0, COTE, COTE));
    if (historique.current.length > HISTORIQUE_MAX) historique.current.shift();
    setNbAnnuler(historique.current.length);
    modifie.current = true;
  };

  const annuler = () => {
    const precedent = historique.current.pop();
    if (!precedent) return;
    couleursRef.current.getContext("2d").putImageData(precedent, 0, 0);
    setNbAnnuler(historique.current.length);
    afficher();
  };

  const recommencer = async () => {
    if (!(await confirmFr({ title: "Tout effacer ?", message: "Les couleurs seront retirées.", confirmLabel: "Effacer" }))) return;
    memoriser();
    const c = couleursRef.current.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, COTE, COTE);
    afficher();
  };

  const point = (e) => versDessin(e.clientX, e.clientY, ecranRef.current.getBoundingClientRect());

  const appui = (e) => {
    if (!pret || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const p = point(e);
    if (outil === "remplir") {
      const c = couleursRef.current.getContext("2d");
      const img = c.getImageData(0, 0, COTE, COTE);
      const avant = img.data.slice();
      if (!remplir(masqueRef.current, img.data, COTE, COTE, p.x, p.y, couleur)) return;
      historique.current.push(new ImageData(avant, COTE, COTE));
      if (historique.current.length > HISTORIQUE_MAX) historique.current.shift();
      setNbAnnuler(historique.current.length);
      modifie.current = true;
      c.putImageData(img, 0, 0);
      afficher();
      return;
    }
    memoriser();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    trace.current = p;
    dessinerVers(p);
  };

  const dessinerVers = (p) => {
    const c = couleursRef.current.getContext("2d");
    c.strokeStyle = outil === "gomme" ? "#fff" : couleur;
    c.lineWidth = taille;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(trace.current.x, trace.current.y);
    c.lineTo(p.x + 0.01, p.y);
    c.stroke();
    trace.current = p;
    afficher();
  };

  const deplacement = (e) => {
    if (!trace.current) return;
    e.preventDefault();
    dessinerVers(point(e));
  };
  const relache = () => { trace.current = null; };

  /** Dessin colorié complet (couleurs + traits), en PNG. */
  const imageFinale = () => new Promise((ok) => ecranRef.current.toBlob((b) => ok(b), "image/png"));

  const garder = async () => {
    if (!pret || !modifie.current) return false;
    const apercu = await imageFinale();
    const couleurs = await new Promise((ok) => couleursRef.current.toBlob((b) => ok(b), "image/png"));
    await enregistrerDessin({
      id: idDessin.current,
      source: source.svg ? { id: source.id, titre: source.titre, integre: true } : { id: source.id, titre: source.titre, image_url: source.image_url },
      titre: source.titre,
      apercu,
      couleurs,
      date: Date.now(),
    });
    modifie.current = false;
    return true;
  };

  // Retour à la liste des images (bouton « Images » ou retour du téléphone) : le dessin commencé est gardé dans
  // « Mes dessins », sans rien demander ; en cas d'échec, on quitte quand même (rien ne bloque l'enfant).
  const quitte = useRef(false);
  const quitter = async () => {
    if (quitte.current) return;
    quitte.current = true;
    try { await garder(); } catch { /* dessin non gardé : on quitte quand même */ }
    onClose();
  };
  useBackHandler(true, quitter);

  const enregistrer = async () => {
    setOccupe(true);
    try {
      modifie.current = true; // toujours mettre à jour « Mes dessins », même sans changement depuis l'ouverture
      await garder();
      const blob = await imageFinale();
      let ou = "";
      try { ou = await enregistrerImageGalerie(blob, `coloriage-${source.titre || "chay"}`); } catch { ou = ""; }
      toast({
        title: "Dessin enregistré",
        description: ou === "galerie" ? "Dans « Mes dessins » et dans la galerie (Images › Chay)." : "Dans « Mes dessins ».",
      });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: e?.message, variant: "destructive" });
    } finally {
      setOccupe(false);
    }
  };

  const Outil = ({ id, label, Icone }) => (
    <button
      type="button"
      onClick={() => setOutil(id)}
      aria-pressed={outil === id}
      className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[0.7rem] font-bold transition ${outil === id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"}`}
    >
      <Icone className="h-6 w-6" />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="Retour à la liste des images"
          className="flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-muted px-1 py-1.5 text-[0.7rem] font-bold text-foreground/80"
        >
          <Images className="h-6 w-6" />
          Images
        </button>
        <button
          type="button"
          onClick={annuler}
          disabled={!nbAnnuler}
          aria-label="Annuler la dernière couleur"
          className="flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl border-2 border-primary/60 px-1 py-1 text-[0.7rem] font-bold text-primary disabled:border-border disabled:text-foreground/30"
        >
          <Undo2 className="h-6 w-6" />
          Annuler
        </button>
        <h2 className="min-w-0 flex-1 truncate font-display text-lg font-extrabold">{source.titre}</h2>
        <button type="button" onClick={recommencer} disabled={!pret} aria-label="Tout effacer" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border disabled:opacity-30">
          <Trash2 className="h-5 w-5" />
        </button>
        <button type="button" onClick={enregistrer} disabled={!pret || occupe} aria-label="Enregistrer" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full brand-gradient px-3 text-sm font-bold text-white disabled:opacity-40 sm:px-4">
          {occupe ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          <span className="hidden sm:inline">Enregistrer</span>
        </button>
      </div>

      <div ref={zoneRef} className="flex min-h-0 flex-1 items-center justify-center px-2">
        {erreur ? (
          <div className="px-6 text-center">
            <p className="font-semibold">{erreur}</p>
            <button type="button" onClick={onClose} className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold">
              <RotateCcw className="h-4 w-4" /> Choisir un autre dessin
            </button>
          </div>
        ) : (
          <div className="relative" style={{ width: cote, height: cote }}>
            <canvas
              ref={ecranRef}
              width={COTE}
              height={COTE}
              onPointerDown={appui}
              onPointerMove={deplacement}
              onPointerUp={relache}
              onPointerCancel={relache}
              aria-label="Dessin à colorier"
              className="h-full w-full touch-none rounded-2xl border border-border bg-white shadow-sm"
            />
            {!pret && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border px-3 pb-2 pt-2">
        <div className="flex items-center justify-center gap-2">
          <Outil id="remplir" label="Remplir" Icone={PaintBucket} />
          <Outil id="pinceau" label="Pinceau" Icone={Brush} />
          <Outil id="gomme" label="Gomme" Icone={Eraser} />
          {outil !== "remplir" && (
            <div className="ml-2 flex items-center gap-2" role="group" aria-label="Taille">
              {TAILLES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTaille(t.px)}
                  aria-label={`Taille ${t.id}`}
                  aria-pressed={taille === t.px}
                  className={`grid h-10 w-10 place-items-center rounded-full border-2 ${taille === t.px ? "border-primary" : "border-border"}`}
                >
                  <span className="rounded-full bg-foreground" style={{ width: Math.max(6, t.px / 2.2), height: Math.max(6, t.px / 2.2) }} />
                </button>
              ))}
            </div>
          )}
        </div>
        {outil !== "gomme" && (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCouleur(c)}
                aria-label={`Couleur ${c}`}
                aria-pressed={couleur === c}
                className={`h-10 w-10 shrink-0 rounded-full border-2 transition ${couleur === c ? "scale-110 border-foreground ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-black/15"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
