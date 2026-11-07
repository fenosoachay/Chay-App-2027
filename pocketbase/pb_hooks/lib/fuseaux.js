// Fuseaux horaires sans Intl (absent du moteur JS de PocketBase).
// Sert au verset du jour : heure de Paris et jour de la semaine de chaque membre (settings.tz).
// Règles : Europe (UE / Royaume-Uni), Amérique du Nord, fuseaux fixes. Fuseau inconnu -> Paris (comme Base44).

const EU_STANDARD = {
  'Europe/London': 0, 'Europe/Dublin': 0, 'Europe/Lisbon': 0, 'Atlantic/Canary': 0, 'Atlantic/Madeira': 0,
  'Europe/Paris': 60, 'Europe/Brussels': 60, 'Europe/Luxembourg': 60, 'Europe/Monaco': 60, 'Europe/Berlin': 60,
  'Europe/Madrid': 60, 'Europe/Rome': 60, 'Europe/Amsterdam': 60, 'Europe/Zurich': 60, 'Europe/Vienna': 60,
  'Europe/Prague': 60, 'Europe/Warsaw': 60, 'Europe/Budapest': 60, 'Europe/Copenhagen': 60, 'Europe/Stockholm': 60,
  'Europe/Oslo': 60, 'Europe/Andorra': 60, 'Europe/Malta': 60, 'Europe/Belgrade': 60, 'Europe/Zagreb': 60,
  'Europe/Ljubljana': 60, 'Europe/Bratislava': 60, 'Europe/Tirane': 60, 'Europe/Gibraltar': 60, 'Africa/Ceuta': 60,
  'Europe/Athens': 120, 'Europe/Helsinki': 120, 'Europe/Kyiv': 120, 'Europe/Kiev': 120, 'Europe/Bucharest': 120,
  'Europe/Sofia': 120, 'Europe/Riga': 120, 'Europe/Tallinn': 120, 'Europe/Vilnius': 120, 'Asia/Nicosia': 120,
};
const NA_STANDARD = {
  'America/New_York': -300, 'America/Toronto': -300, 'America/Montreal': -300, 'America/Detroit': -300,
  'America/Port-au-Prince': -300, 'America/Chicago': -360, 'America/Winnipeg': -360, 'America/Denver': -420,
  'America/Edmonton': -420, 'America/Los_Angeles': -480, 'America/Vancouver': -480, 'America/Halifax': -240,
  'America/Anchorage': -540,
};
const FIXED = {
  UTC: 0, 'Etc/UTC': 0, GMT: 0, 'Africa/Abidjan': 0, 'Africa/Dakar': 0, 'Africa/Accra': 0, 'Africa/Bamako': 0,
  'Africa/Conakry': 0, 'Africa/Lome': 0, 'Africa/Ouagadougou': 0, 'Africa/Casablanca': 60, 'Africa/Algiers': 60,
  'Africa/Tunis': 60, 'Africa/Lagos': 60, 'Africa/Douala': 60, 'Africa/Kinshasa': 60, 'Africa/Brazzaville': 60,
  'Africa/Libreville': 60, 'Africa/Niamey': 60, 'Africa/Ndjamena': 60, 'Africa/Porto-Novo': 60, 'Africa/Bangui': 60,
  'Africa/Lubumbashi': 120, 'Africa/Johannesburg': 120, 'Africa/Kigali': 120, 'Africa/Bujumbura': 120,
  'Africa/Cairo': 120, 'Africa/Maputo': 120, 'Africa/Harare': 120, 'Africa/Nairobi': 180, 'Africa/Addis_Ababa': 180,
  'Africa/Dar_es_Salaam': 180, 'Indian/Antananarivo': 180, 'Indian/Mayotte': 180, 'Indian/Comoro': 180,
  'Indian/Reunion': 240, 'Indian/Mauritius': 240, 'Indian/Mahe': 240, 'Asia/Dubai': 240, 'Europe/Moscow': 180,
  'Europe/Istanbul': 180, 'America/Martinique': -240, 'America/Guadeloupe': -240, 'America/Cayenne': -180,
  'America/Phoenix': -420, 'America/Sao_Paulo': -180, 'Pacific/Tahiti': -600, 'Pacific/Noumea': 660,
  'Asia/Tokyo': 540, 'Asia/Shanghai': 480, 'Asia/Singapore': 480, 'Asia/Kolkata': 330,
};
const DAY_MS = 86400000;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Date UTC (ms) du n-ième dimanche (n = -1 : dernier) du mois `month` (0-11), à `hourUtc` h. */
function sunday(year, month, n, hourUtc) {
  if (n < 0) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), hourUtc);
  }
  const first = new Date(Date.UTC(year, month, 1));
  return Date.UTC(year, month, 1 + ((7 - first.getUTCDay()) % 7) + 7 * (n - 1), hourUtc);
}

/** Décalage (minutes) du fuseau `tz` à l'instant `ms`, ou null si fuseau inconnu. */
function offsetMinutes(tz, ms) {
  const y = new Date(ms).getUTCFullYear();
  if (Object.prototype.hasOwnProperty.call(EU_STANDARD, tz)) {
    // UE : heure d'été du dernier dimanche de mars 01:00 UTC au dernier dimanche d'octobre 01:00 UTC.
    const dst = ms >= sunday(y, 2, -1, 1) && ms < sunday(y, 9, -1, 1);
    return EU_STANDARD[tz] + (dst ? 60 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(NA_STANDARD, tz)) {
    // Amérique du Nord : 2e dimanche de mars 02:00 locale -> 1er dimanche de novembre 02:00 locale (heure d'été).
    const std = NA_STANDARD[tz];
    const start = sunday(y, 2, 2, 0) + (2 * 60 - std) * 60000;
    const end = sunday(y, 10, 1, 0) + (2 * 60 - (std + 60)) * 60000;
    return std + (ms >= start && ms < end ? 60 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(FIXED, tz)) return FIXED[tz];
  return null;
}

const pad = (n) => (n < 10 ? `0${n}` : String(n));

/** { dateStr: "AAAA-MM-JJ", weekday: "mon".."sun", hhmm: "HH:MM", known } dans le fuseau `tz` (inconnu -> Paris). */
function localParts(ms, tz) {
  let off = offsetMinutes(tz, ms);
  const known = off !== null;
  if (!known) off = offsetMinutes('Europe/Paris', ms);
  const d = new Date(ms + off * 60000);
  return {
    dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    weekday: WEEKDAYS[d.getUTCDay()],
    hhmm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    known,
  };
}

module.exports = { offsetMinutes, localParts, DAY_MS };
