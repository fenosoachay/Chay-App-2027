// Archivage automatique des réunions (Announcement type « event ») une fois leur heure passée.
// Heure de la réunion = event_date (sinon date) + event_time (HH:MM), à l'heure de Paris.
// Réunion sans heure (créée avant 1.3.6) : archivée à la fin de sa journée (23:59 à Paris).
// Archivée = `archived` vrai : masquée aux membres (règle de lecture), visible des admins (« Archivées »).

const HEURE_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const JOUR_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const APP_TZ = 'Europe/Paris';

/**
 * Instant (ms UTC) de la réunion, ou null si la date est illisible.
 * `offsetMinutes(tz, ms)` : décalage du fuseau (lib/fuseaux.js), passé en paramètre pour les tests.
 */
function instantReunion(evt, offsetMinutes) {
  const jour = JOUR_RE.exec(String(evt.event_date || evt.date || ''));
  if (!jour) return null;
  const heure = HEURE_RE.test(String(evt.event_time || '')) ? evt.event_time : '23:59';
  const [h, m] = heure.split(':').map(Number);
  const localUtc = Date.UTC(Number(jour[1]), Number(jour[2]) - 1, Number(jour[3]), h, m);
  // Le décalage dépend de l'instant (heure d'été) : estimation puis correction.
  let ms = localUtc - (offsetMinutes(APP_TZ, localUtc) || 0) * 60000;
  ms = localUtc - (offsetMinutes(APP_TZ, ms) || 0) * 60000;
  return ms;
}

/** Réunion à archiver maintenant ? */
function aArchiver(evt, nowMs, offsetMinutes) {
  if (!evt || evt.type !== 'event' || evt.archived === true) return false;
  const t = instantReunion(evt, offsetMinutes);
  return t !== null && t <= nowMs;
}

/** Tâche serveur : archive les réunions passées. Renvoie { examinees, archivees }. */
function archiverReunions(nowMs) {
  const fuseaux = require(`${__hooks}/lib/fuseaux.js`);
  const lignes = $app.findRecordsByFilter('Announcement', "type = 'event' && archived != true", '', 2000, 0);
  let archivees = 0;
  for (const r of lignes) {
    const evt = {
      type: r.getString('type'), archived: r.getBool('archived'), date: r.getString('date'),
      event_date: r.getString('event_date'), event_time: r.getString('event_time'),
    };
    if (!aArchiver(evt, nowMs, fuseaux.offsetMinutes)) continue;
    try {
      r.set('archived', true);
      $app.save(r);
      archivees++;
    } catch (_) {
      $app.logger().error('[reunions_archivage] enregistrement impossible', 'id', r.id);
    }
  }
  return { examinees: lignes.length, archivees };
}

module.exports = { instantReunion, aArchiver, archiverReunions, HEURE_RE };
