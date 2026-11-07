// Module partagé des routes POST /api/fn/<nom> (équivalents des fonctions Base44).
// Chargé dans chaque handler par : const fn = require(`${__hooks}/lib/fn.js`)
// (les handlers PocketBase s'exécutent isolés : pas de variables partagées entre fichiers).
//
// Format des réponses = celui des fonctions Base44 :
//   succès : HTTP 200 + objet JSON de la fonction (le client lit `res.data`) ;
//   erreur : HTTP <code> + { error: "<message>" } (le client lit `error.data.error`).

/**
 * Erreur HTTP « métier » renvoyée telle quelle au client : { error, ...extra }.
 * `extra` reproduit les champs supplémentaires de certaines fonctions Base44
 * (ex. limit_reached, creditsRemaining, requested / available).
 */
function HttpError(status, message, extra) {
  this.status = status;
  this.message = message;
  this.extra = extra || null;
  this.isHttpError = true;
}

/**
 * Résultat d'une transaction : on ne lance jamais d'exception JS à l'intérieur de
 * runInTransaction (elle traverserait le code Go et perdrait ses propriétés).
 * Le callback renvoie fail(...) ou ok(...) ; tx() relance l'erreur après la transaction.
 */
const fail = (status, message, extra) => ({ failed: true, status, message, extra });
const ok = (value) => ({ failed: false, value });
function tx(work) {
  let outcome = null;
  $app.runInTransaction((txApp) => {
    outcome = work(txApp);
  });
  if (!outcome) throw new Error('transaction sans résultat');
  if (outcome.failed) throw new HttpError(outcome.status, outcome.message, outcome.extra);
  return outcome.value;
}

/** Premier enregistrement correspondant (filtre paramétré), ou null. */
function findOne(app, collection, filter, sort, params) {
  const rows = app.findRecordsByFilter(collection, filter, sort || '', 1, 0, params || {});
  return rows.length ? rows[0] : null;
}

/** Nouvel enregistrement (non sauvegardé) avec les valeurs données. */
function newRecord(app, collection, values) {
  const rec = new Record(app.findCollectionByNameOrId(collection));
  for (const k of Object.keys(values)) rec.set(k, values[k]);
  return rec;
}

/** Identifiant de session au format UUID v4 (comme crypto.randomUUID côté Base44). */
function uuid() {
  const h = $security.randomStringWithAlphabet(32, '0123456789abcdef');
  const v = '89ab'[parseInt(h[16], 16) % 4];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Fisher-Yates (même algorithme que les règles partagées Base44). */
function shuffle(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** Texte optionnel borné : '' si absent ; erreur 400 si type ou longueur invalides. */
function optionalString(body, key, maxLength, message) {
  const v = body[key];
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' || v.length > maxLength) throw new HttpError(400, message || `${key} invalide`);
  return v;
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
    if (err && err.isHttpError) {
      const body = { error: err.message };
      if (err.extra) for (const k of Object.keys(err.extra)) body[k] = err.extra[k];
      return e.json(err.status, body);
    }
    $app.logger().error('[fn] échec', 'fonction', name);
    return e.json(500, { error: fallback });
  }
}

module.exports = {
  HttpError,
  fail,
  ok,
  tx,
  findOne,
  newRecord,
  uuid,
  shuffle,
  optionalString,
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
