// Module partagé des routes POST /api/fn/<nom> (équivalents des fonctions Base44).
// Chargé dans chaque handler par : const fn = require(`${__hooks}/lib/fn.js`)
// (les handlers PocketBase s'exécutent isolés : pas de variables partagées entre fichiers).
//
// Format des réponses = celui des fonctions Base44 :
//   succès : HTTP 200 + objet JSON de la fonction (le client lit `res.data`) ;
//   erreur : HTTP <code> + { error: "<message>" } (le client lit `error.data.error`).

/** Erreur HTTP « métier » renvoyée telle quelle au client. */
function HttpError(status, message) {
  this.status = status;
  this.message = message;
  this.isHttpError = true;
}

/** Utilisateur de l'app authentifié (collection users) ou null. Jamais d'id fourni par le client. */
function currentUser(e) {
  const auth = e.auth;
  if (!auth) return null;
  if (auth.collection().name !== 'users') return null;
  return auth;
}

/** Exige un utilisateur connecté et non désactivé. */
function requireUser(e, message) {
  const user = currentUser(e);
  if (!user) throw new HttpError(401, message || 'Connexion requise');
  if (user.getBool('disabled')) throw new HttpError(403, 'Compte désactivé');
  return user;
}

/** Exige un utilisateur connecté avec role = "admin". */
function requireAdmin(e, message) {
  const user = requireUser(e);
  if (user.getString('role') !== 'admin') throw new HttpError(403, message || 'Accès réservé aux administrateurs');
  return user;
}

/** Corps JSON de la requête ; {} si absent ou invalide (comme `req.json().catch(() => ({}))`). */
function readBody(e) {
  try {
    const body = e.requestInfo().body;
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch (_) {
    return {};
  }
}

/** Chaîne non vide obligatoire (longueur bornée), sinon 400 avec le message d'origine. */
function requireString(body, key, message, maxLength) {
  const v = body[key];
  if (typeof v !== 'string' || !v || v.length > (maxLength || 200)) throw new HttpError(400, message || `${key} required`);
  return v;
}

/** Enregistrement -> objet JS simple (valeurs telles qu'exportées par l'API, json déjà décodé). */
function plain(record) {
  return JSON.parse(JSON.stringify(record));
}

/** Date PocketBase "AAAA-MM-JJ HH:MM:SS.sssZ" -> ISO "AAAA-MM-JJTHH:MM:SS.sssZ" ; "" -> null. */
function isoDate(value) {
  if (!value) return null;
  return String(value).replace(' ', 'T');
}

/** created_date au sens Base44 : base44_created_date, sinon created. */
function createdDate(p) {
  return isoDate(p.base44_created_date || p.created);
}

/** Enregistrement par id, ou null s'il n'existe pas. */
function findById(collection, id) {
  try {
    return $app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

/**
 * Exécute un handler et formate la réponse.
 * @param name     nom de la fonction (journal sans donnée personnelle)
 * @param fallback message renvoyé en cas d'erreur interne (500)
 */
function run(e, name, fallback, handler) {
  try {
    return e.json(200, handler());
  } catch (err) {
    if (err && err.isHttpError) return e.json(err.status, { error: err.message });
    $app.logger().error('[fn] échec', 'fonction', name);
    return e.json(500, { error: fallback });
  }
}

module.exports = {
  HttpError,
  currentUser,
  requireUser,
  requireAdmin,
  readBody,
  requireString,
  plain,
  isoDate,
  createdDate,
  findById,
  run,
};
