import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { AnimatePresence, motion } from "framer-motion";
import { animationCentre, besoinPlaylists, disposition, dureeBande, dureePassage, tailleTexte, tempsAffichage, textesPour } from "@/lib/texteDefilant";

// Texte qui défile sur la photo du lecteur (1.3.26), posé dans le carré de la couverture (Musique, Prédication,
// Bible en audio). Textes de Admin › Multimédia › Texte qui défile, chargés une fois (gardés en mémoire).
// 1.3.34 : 12 animations (lib/texteDefilant.js › ANIMATIONS) : bandes en haut et/ou en bas dans un sens ou
// l'autre, vertical (de haut en bas, de bas en haut) avec fondu, mot par mot, machine à écrire, respiration,
// varié. Au milieu, un texte après l'autre, à une taille qui suit sa longueur.

// 1.3.34 : gardé 10 s seulement : une modification faite dans l'Admin se voit à la prochaine ouverture du
// lecteur ou au titre suivant (avant : gardé jusqu'à la fermeture de l'app).
let cache = null; // Promise<{ rows, parents }>
let chargeLe = 0;
function chargerTextes() {
  if (!cache || Date.now() - chargeLe > 10000) {
    chargeLe = Date.now();
    cache = (async () => {
      const rows = await base44.entities.TexteDefilant.list("order", 200).catch(() => []);
      const liste = Array.isArray(rows) ? rows : [];
      let parents = new Map();
      if (besoinPlaylists(liste)) {
        const pl = await base44.entities.Playlist.list("-created_date", 2000).catch(() => []);
        parents = new Map((Array.isArray(pl) ? pl : []).filter((p) => p.parent_id).map((p) => [p.id, p.parent_id]));
      }
      return { rows: liste, parents };
    })();
  }
  return cache;
}

function Bandeau({ textes, haut = false, sens = "gauche" }) {
  const piste = useRef(null);
  const [duree, setDuree] = useState(12);
  useLayoutEffect(() => {
    const largeur = piste.current ? piste.current.scrollWidth / 2 : 0;
    setDuree(dureeBande(textes, largeur)); // 1.3.35 : secondes réglées dans l'admin, sinon la vitesse
  }, [textes]);
  const une = textes.map((t, i) => (
    <span key={`${t.id}-${i}`} className="px-6" style={{ color: t.couleur }}>{t.texte}<span className="pl-6 opacity-60" aria-hidden="true">•</span></span>
  ));
  return (
    <div className={`pointer-events-none absolute inset-x-0 overflow-hidden ${haut ? "top-0 bg-gradient-to-b pb-7 pt-3" : "bottom-0 bg-gradient-to-t pb-3 pt-7"} from-black/75 via-black/50 to-transparent`}>
      <div
        ref={piste}
        className="chay-txt-anim inline-flex whitespace-nowrap text-[0.95rem] font-bold tracking-wide"
        style={{
          animation: `chay-txt-x ${duree}s linear infinite ${sens === "droite" ? "reverse" : "normal"}`,
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        }}
      >
        {une}
        <span aria-hidden="true" className="inline-flex">{une}</span>
      </div>
    </div>
  );
}

// 1.3.34 : animations en CSS (transform et opacité, translate3d) jouées par la carte graphique : fluides même
// quand le lecteur se met à jour plusieurs fois par seconde. Pas de flou ni d'ombre animés (trop coûteux).
const CSS_TEXTES = `
@keyframes chay-txt-x { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-50%, 0, 0); } }
@keyframes chay-txt-y { from { transform: translate3d(0, var(--chay-debut), 0); } to { transform: translate3d(0, var(--chay-fin), 0); } }
@keyframes chay-txt-mot { from { opacity: 0; transform: translate3d(0, 12px, 0) scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes chay-txt-respire { 0%, 100% { transform: scale(0.96); } 50% { transform: scale(1.06); } }
@keyframes chay-txt-lueur { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.8; } }
@keyframes chay-txt-curseur { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.chay-txt-anim { will-change: transform; backface-visibility: hidden; }
`;

const MASQUE = "linear-gradient(to bottom, transparent, black 16%, black 84%, transparent)";
const FONDU = { WebkitMaskImage: MASQUE, maskImage: MASQUE };
const ombre = () => "0 2px 8px rgba(0,0,0,0.7)";

/** Vertical : le texte traverse la photo de bas en haut (ou de haut en bas), en fondu aux bords. */
function Vertical({ t, descend, onFin }) {
  const cadre = useRef(null);
  const bloc = useRef(null);
  const [anim, setAnim] = useState(null);
  useLayoutEffect(() => {
    const h = cadre.current?.clientHeight || 300;
    const c = bloc.current?.offsetHeight || 0;
    setAnim({ h, c, duree: t.secondes || dureePassage(h + c, t.vitesse) });
  }, [t]);
  return (
    <div ref={cadre} className="absolute inset-0 overflow-hidden" style={FONDU}>
      <p
        ref={bloc}
        className="chay-txt-anim absolute inset-x-0 top-0 px-6 text-center font-display font-extrabold leading-snug"
        style={{
          color: t.couleur, fontSize: tailleTexte(t.texte), textShadow: ombre(), opacity: anim ? 1 : 0,
          ...(anim ? {
            "--chay-debut": `${descend ? -anim.c : anim.h}px`, "--chay-fin": `${descend ? anim.h : -anim.c}px`,
            animation: `chay-txt-y ${anim.duree}s linear both`,
          } : {}),
        }}
        onAnimationEnd={() => anim && onFin()}
      >
        {t.texte}
      </p>
    </div>
  );
}

/** Mot par mot : chaque mot arrive en fondu (léger flou qui se dissipe), la phrase reste, puis s'efface. */
function MotParMot({ t, onFin }) {
  const mots = t.texte.split(" ");
  // 1.3.35 : durée réglée : les mots arrivent pendant la première moitié, la phrase reste l'autre moitié.
  const pas = t.secondes ? Math.min(0.8, (t.secondes * 0.5) / mots.length) : Math.max(0.12, Math.min(0.4, 6 / mots.length));
  const total = t.secondes || mots.length * pas + 3;
  useEffect(() => {
    const id = setTimeout(onFin, total * 1000);
    return () => clearTimeout(id);
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <p className="px-6 text-center font-display font-extrabold leading-snug" style={{ color: t.couleur, fontSize: tailleTexte(t.texte), textShadow: ombre() }}>
      {mots.map((m, i) => (
        <span
          key={i}
          className="chay-txt-anim inline-block"
          style={{ animation: `chay-txt-mot 0.55s ease-out ${i * pas}s both` }}
        >
          {m}{i < mots.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </p>
  );
}

/** Machine à écrire : les lettres s'écrivent une à une, curseur qui clignote. */
function Machine({ t, onFin }) {
  const [n, setN] = useState(0);
  const lettres = [...t.texte];
  useEffect(() => {
    setN(0);
    // 1.3.35 : durée réglée : 60 % pour écrire, 40 % pour lire.
    const pas = t.secondes ? (t.secondes * 600) / Math.max(1, lettres.length) : Math.max(25, Math.min(90, 2600 / lettres.length));
    const pause = t.secondes ? t.secondes * 400 : 2600;
    let k = 0;
    let fin;
    const id = setInterval(() => {
      k += 1;
      setN(k);
      if (k >= lettres.length) { clearInterval(id); fin = setTimeout(onFin, pause); }
    }, pas);
    return () => { clearInterval(id); clearTimeout(fin); };
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <p className="px-6 text-center font-mono font-bold leading-snug" style={{ color: t.couleur, fontSize: tailleTexte(t.texte), textShadow: ombre() }}>
      {lettres.slice(0, n).join("")}
      <span
        className="ml-0.5 inline-block w-[0.5ch] border-b-2"
        style={{ borderColor: t.couleur, animation: "chay-txt-curseur 0.9s step-end infinite" }}
        aria-hidden="true"
      >
        &nbsp;
      </span>
    </p>
  );
}

/** Respiration : la phrase gonfle et dégonfle doucement, avec une lueur. */
function Respiration({ t, onFin }) {
  // Deux respirations (7 s, ou la durée réglée). La lueur est une tache floue fixe dont seule l'opacité varie.
  const souffle = tempsAffichage(t, 7) / 2;
  return (
    <div className="relative grid place-items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-20%] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${t.couleur}66, transparent)`, animation: `chay-txt-lueur ${souffle}s ease-in-out 2 both` }}
      />
      <p
        className="chay-txt-anim relative px-6 text-center font-display font-extrabold leading-snug"
        style={{ color: t.couleur, fontSize: tailleTexte(t.texte), textShadow: ombre(), animation: `chay-txt-respire ${souffle}s ease-in-out 2 both` }}
        onAnimationEnd={onFin}
      >
        {t.texte}
      </p>
    </div>
  );
}

/** Milieu de la photo : un texte après l'autre, chacun avec son animation, en fondu enchaîné. */
function Centre({ textes }) {
  const [passage, setPassage] = useState(0);
  const t = textes[passage % textes.length];
  const anim = animationCentre(t, passage);
  const suivant = () => setPassage((p) => p + 1);
  const vertical = anim === "monte" || anim === "descend";
  return (
    <div className="absolute inset-0 bg-black/25" style={{ containerType: "size" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={passage}
          className="absolute inset-0 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
          transition={{ duration: 0.6 }}
        >
          {vertical ? <Vertical t={t} descend={anim === "descend"} onFin={suivant} />
            : anim === "machine" ? <Machine t={t} onFin={suivant} />
              : anim === "respire" ? <Respiration t={t} onFin={suivant} />
                : <MotParMot t={t} onFin={suivant} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TexteDefilantCouverture({ piste }) {
  const [donnees, setDonnees] = useState(null);
  useEffect(() => {
    let vivant = true;
    chargerTextes().then((d) => { if (vivant) setDonnees(d); });
    return () => { vivant = false; };
  }, [piste?.id]); // relu à chaque titre (au plus toutes les 10 s)
  const textes = useMemo(
    () => (donnees ? textesPour(donnees.rows, piste, { parents: donnees.parents }) : []),
    [donnees, piste]
  );
  if (!textes.length) return null;
  const { haut, bas, centre } = disposition(textes);
  return (
    <div className="pointer-events-none absolute inset-0" aria-live="off" aria-label={textes.map((t) => t.texte).join(". ")} role="note">
      <style>{CSS_TEXTES}</style>
      {centre.length > 0 && <Centre key={`c-${piste?.id}`} textes={centre} />}
      {haut && <Bandeau key={`h-${piste?.id}`} textes={haut.textes} sens={haut.sens} haut />}
      {bas && <Bandeau key={`b-${piste?.id}`} textes={bas.textes} sens={bas.sens} />}
    </div>
  );
}

// Le lecteur se redessine plusieurs fois par seconde (temps écoulé) : les textes, eux, ne changent qu'avec le titre.
export default React.memo(TexteDefilantCouverture, (a, b) => a.piste?.id === b.piste?.id && a.piste?.playlist_id === b.piste?.playlist_id);
