// Compteur de vues du multimédia (lot E) : règles pures, testées hors de PocketBase. Route : vues.pb.js.
//  - piste     : titre audio ou film d'une playlist (identifiant du contenu = PlaylistTrack.track_id) ; le compteur
//                est `listen_count` de chaque ligne PlaylistTrack de ce contenu (déjà affiché dans les listes) ;
//  - youtube   : YouTubeVideo.view_count ;
//  - article   : Article.view_count ;
//  - parole    : Paroles.view_count ; verset : Verset.view_count (champs ajoutés par migrer-1-3-21).
// Anti-doublon : une nouvelle vue du même membre sur le même contenu est ignorée pendant 30 minutes (journal
// MediaVue, purgé au fil de l'eau : les entrées de plus de 24 h du membre sont supprimées à chaque vue comptée).

const CIBLES = {
  piste: { collection: 'PlaylistTrack', champ: 'listen_count', parChamp: 'track_id' },
  youtube: { collection: 'YouTubeVideo', champ: 'view_count' },
  article: { collection: 'Article', champ: 'view_count' },
  parole: { collection: 'Paroles', champ: 'view_count' },
  verset: { collection: 'Verset', champ: 'view_count' },
};
const FENETRE_MS = 30 * 60 * 1000;
const PURGE_MS = 24 * 3600 * 1000;

/** { type, id, cle, cible } ou { erreur }. Identifiant : 1 à 40 caractères alphanumériques (PocketBase, Base44). */
function lireDemande(body) {
  const b = body && typeof body === 'object' ? body : {};
  const type = typeof b.type === 'string' ? b.type : '';
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  if (!Object.prototype.hasOwnProperty.call(CIBLES, type)) return { erreur: 'type de contenu inconnu' };
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) return { erreur: 'identifiant invalide' };
  return { type, id, cle: `${type}:${id}`, cible: CIBLES[type] };
}

/** Compteur entier positif d'une valeur enregistrée. */
const entier = (v) => Math.max(0, Math.floor(Number(v) || 0));

module.exports = { CIBLES, FENETRE_MS, PURGE_MS, lireDemande, entier };
