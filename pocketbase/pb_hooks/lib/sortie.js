// Interrupteur des envois sortants des hooks : push (FCM, Web Push, file PushEnvoi) et e-mails de notification.
//   NOTIFICATIONS_MODE = "off"  : rien ne sort (défaut si la variable est absente ou invalide) ;
//                        "test" : seulement vers les comptes dont l'e-mail est dans NOTIFICATIONS_TEST_EMAILS
//                                 (séparés par des virgules, casse ignorée) ;
//                        "on"   : comportement normal.
// Les e-mails d'authentification de PocketBase (OTP, réinitialisation, vérification, changement d'e-mail)
// ne passent pas par ici : ils restent déclenchés par l'action d'un membre.
// Journaux : compteurs seulement, jamais d'adresse ni d'identifiant.

const MODES = { off: true, test: true, on: true };

function mode() {
  const m = String($os.getenv('NOTIFICATIONS_MODE') || '').trim().toLowerCase();
  return MODES[m] ? m : 'off';
}

function testEmails() {
  return String($os.getenv('NOTIFICATIONS_TEST_EMAILS') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** L'adresse e-mail peut-elle recevoir un envoi dans le mode courant ? */
function emailAllowed(address) {
  const m = mode();
  if (m === 'on') return true;
  if (m === 'off') return false;
  const a = String(address || '').trim().toLowerCase();
  return Boolean(a) && testEmails().indexOf(a) !== -1;
}

/** Garde, parmi `ids` (membres), ceux qui peuvent recevoir un envoi dans le mode courant. */
function filterUserIds(ids) {
  const m = mode();
  const list = Array.isArray(ids) ? ids : [];
  if (m === 'on') return list.slice();
  if (m === 'off') return [];
  const allowed = testEmails();
  if (!allowed.length) return [];
  const cache = {};
  return list.filter((id) => {
    if (typeof id !== 'string' || !id) return false;
    if (!(id in cache)) {
      let email = '';
      try { email = $app.findRecordById('users', id).email(); } catch (_) { email = ''; }
      cache[id] = allowed.indexOf(String(email || '').trim().toLowerCase()) !== -1;
    }
    return cache[id];
  });
}

/** Journalise un nombre d'envois bloqués (aucune donnée personnelle). */
function blocked(canal, count) {
  if (count > 0) $app.logger().info('[sortie] envois bloques', 'mode', mode(), 'canal', canal, 'nombre', count);
}

module.exports = { mode, testEmails, emailAllowed, filterUserIds, blocked };
