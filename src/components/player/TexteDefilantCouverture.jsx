import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { bandes, besoinPlaylists, dureePassage, textesPour } from "@/lib/texteDefilant";

// Texte qui défile sur la photo du lecteur (1.3.26), posé dans le carré de la couverture (Musique, Prédication,
// Bible en audio). Textes de Admin › Multimédia › Texte qui défile, chargés une fois (gardés en mémoire).
// 1.3.34 : deux bandes horizontales : en bas de droite à gauche, en haut de gauche à droite ; le même texte ou
// deux textes différents (lib/texteDefilant.js › bandes).

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

function Bandeau({ textes, haut = false }) {
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
    <div className={`pointer-events-none absolute inset-x-0 overflow-hidden ${haut ? "top-0 bg-gradient-to-b pb-7 pt-3" : "bottom-0 bg-gradient-to-t pb-3 pt-7"} from-black/75 via-black/50 to-transparent`}>
      <div
        ref={piste}
        className="chay-defile-gauche inline-flex whitespace-nowrap text-[0.95rem] font-bold tracking-wide drop-shadow"
        style={{ animationDuration: `${duree}s`, animationDirection: haut ? "reverse" : "normal" }}
      >
        {une}
        <span aria-hidden="true" className="inline-flex">{une}</span>
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
  const { haut, bas } = bandes(textes);
  return (
    <div className="absolute inset-0" aria-live="off" aria-label={textes.map((t) => t.texte).join(". ")} role="note">
      <Bandeau key={`h-${piste?.id}`} textes={haut} haut />
      <Bandeau key={`b-${piste?.id}`} textes={bas} />
    </div>
  );
}
