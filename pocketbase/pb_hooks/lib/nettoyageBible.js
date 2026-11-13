// Nettoyage d'un livre RETIRÉ de « Sagesse en audio » (1.3.8 : les Psaumes) : fiches BibleAudio du livre et objets
// R2 sous <préfixe>/bible/<livre>/. Règles pures (testées hors de PocketBase) ; route : bible_nettoyage.pb.js.
// Seuls les livres de LIVRES_RETIRES peuvent être nettoyés : jamais un livre encore proposé aux membres.

const LIVRES_RETIRES = ['psaumes'];

/** Préfixe R2 d'un livre : « videos/bible/psaumes/ ». */
const prefixeLivre = (prefix, livre) => `${prefix}/bible/${livre}/`;

/**
 * Clé R2 d'une adresse publique, si elle est rangée sous le préfixe du livre ; sinon null (adresse externe,
 * ou fichier rangé ailleurs : jamais supprimé par ce nettoyage).
 */
function cleDepuisUrl(url, publicBaseUrl, prefixe) {
  const base = `${String(publicBaseUrl || '').replace(/\/+$/, '')}/`;
  const u = String(url || '');
  if (!base || base === '/' || u.indexOf(base) !== 0) return null;
  let cle;
  try { cle = u.slice(base.length).split('/').map((s) => decodeURIComponent(s)).join('/'); } catch (_) { return null; }
  return cle.indexOf(prefixe) === 0 && cle.length > prefixe.length && cle.indexOf('..') < 0 ? cle : null;
}

/**
 * Plan : fiches (id, chapitre, clé) et objets R2 à supprimer.
 * `fiches` : [{ id, chapter, audio_url }], `objets` : [{ key, size }] listés sous le préfixe.
 * Renvoie { fiches, objets, octets, fichesHorsRangement, clesSansObjet, objetsSansFiche }.
 */
function planNettoyage(fiches, objets, publicBaseUrl, prefixe) {
  const listees = new Set((objets || []).map((o) => o.key));
  const lignes = (fiches || []).map((f) => ({ id: f.id, chapitre: f.chapter, cle: cleDepuisUrl(f.audio_url, publicBaseUrl, prefixe) }));
  const clesDesFiches = new Set(lignes.filter((l) => l.cle).map((l) => l.cle));
  return {
    fiches: lignes,
    objets: (objets || []).filter((o) => o.key.indexOf(prefixe) === 0),
    octets: (objets || []).reduce((n, o) => n + (Number(o.size) || 0), 0),
    fichesHorsRangement: lignes.filter((l) => !l.cle).length,
    clesSansObjet: lignes.filter((l) => l.cle && !listees.has(l.cle)).length,
    objetsSansFiche: (objets || []).filter((o) => !clesDesFiches.has(o.key)).length,
  };
}

module.exports = { LIVRES_RETIRES, prefixeLivre, cleDepuisUrl, planNettoyage };
