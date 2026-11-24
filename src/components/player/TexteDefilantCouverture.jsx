import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { besoinPlaylists, dureePassage, textesPour } from "@/lib/texteDefilant";

// Texte qui défile sur la photo du lecteur (1.3.26), posé dans le carré de la couverture (Musique, Prédication,
// Bible en audio). Textes de Admin › Multimédia › Texte qui défile, chargés une fois (gardés en mémoire).
//  - « De droite à gauche » : un bandeau en bas de la photo, comme le bandeau du site chay.fr ;
//  - « Monte » : le texte passe de bas en haut sur la photo, sur un léger voile sombre pour rester lisible.

let cache = null; // Promise<{ rows, parents }>
function chargerTextes() {
  if (!cache) {
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
    // Hors connexion : on réessaiera au prochain titre.
    cache.then(({ rows }) => { if (!rows.length) setTimeout(() => { cache = null; }, 60000); });
  }
  return cache;
}

function Bandeau({ textes }) {
  const piste = useRef(null);
  const [duree, setDuree] = useState(12);
  const vitesse = textes[0].vitesse;
  useLayoutEffect(() => {
    const largeur = piste.current ? piste.current.scrollWidth / 2 : 0;
    setDuree(dureePassage(largeur, vitesse));
  }, [textes, vitesse]);
  const une = textes.map((t, i) => (
    <span key={`${t.id}-${i}`} className="px-6" style={{ color: t.couleur }}>{t.texte}<span className="pl-6 opacity-60" aria-hidden="true">•</span></span>
  ));
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden bg-gradient-to-t from-black/75 via-black/50 to-transparent pb-3 pt-7">
      <div
        ref={piste}
        className="chay-defile-gauche inline-flex whitespace-nowrap text-[0.95rem] font-bold tracking-wide drop-shadow"
        style={{ animationDuration: `${duree}s` }}
      >
        {une}
        <span aria-hidden="true" className="inline-flex">{une}</span>
      </div>
    </div>
  );
}

const MASQUE = "linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)";
const FONDU = { WebkitMaskImage: MASQUE, maskImage: MASQUE };

function Montee({ textes }) {
  const cadre = useRef(null);
  const bloc = useRef(null);
  const [anim, setAnim] = useState(null);
  const vitesse = textes[0].vitesse;
  useLayoutEffect(() => {
    const h = cadre.current?.clientHeight || 0;
    const c = bloc.current?.offsetHeight || 0;
    setAnim({ debut: `${h}px`, fin: `${-c}px`, duree: dureePassage(h + c, vitesse) });
  }, [textes, vitesse]);
  return (
    <div ref={cadre} className="pointer-events-none absolute inset-0 overflow-hidden bg-black/30" style={FONDU}>
      <div
        ref={bloc}
        className={`absolute inset-x-0 top-0 space-y-6 px-6 text-center font-display text-xl font-extrabold leading-snug drop-shadow ${anim ? "chay-defile-haut" : "opacity-0"}`}
        style={anim ? { "--chay-debut": anim.debut, "--chay-fin": anim.fin, animationDuration: `${anim.duree}s` } : undefined}
      >
        {textes.map((t) => <p key={t.id} style={{ color: t.couleur }}>{t.texte}</p>)}
      </div>
    </div>
  );
}

export default function TexteDefilantCouverture({ piste }) {
  const [donnees, setDonnees] = useState(null);
  useEffect(() => {
    let vivant = true;
    chargerTextes().then((d) => { if (vivant) setDonnees(d); });
    return () => { vivant = false; };
  }, []);
  const textes = useMemo(
    () => (donnees ? textesPour(donnees.rows, piste, { parents: donnees.parents }) : []),
    [donnees, piste]
  );
  if (!textes.length) return null;
  const montent = textes.filter((t) => t.direction === "monte");
  const gauche = textes.filter((t) => t.direction === "gauche");
  return (
    <div className="absolute inset-0" aria-live="off" aria-label={textes.map((t) => t.texte).join(". ")} role="note">
      {montent.length > 0 && <Montee key={`m-${piste?.id}`} textes={montent} />}
      {gauche.length > 0 && <Bandeau key={`g-${piste?.id}`} textes={gauche} />}
    </div>
  );
}
