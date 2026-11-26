// Un appareil = un seul compte pour les notifications (1.3.43). Voir appareils.pb.js.
// Désactive les lignes DeviceToken des AUTRES comptes qui ont le même jeton que `record` (s'il est actif).
function garderSeulement(record) {
  if (!record || !record.getBool('is_active')) return 0;
  const jeton = record.getString('token');
  if (!jeton) return 0;
  const autres = $app.findRecordsByFilter('DeviceToken', 'token = {:t} && id != {:id} && is_active = true', '', 0, 0,
    { t: jeton, id: record.id });
  let n = 0;
  for (const r of autres) {
    if (r.getString('user_id') === record.getString('user_id')) continue; // doublon du même compte : l'appli s'en charge
    r.set('is_active', false);
    $app.save(r);
    n++;
  }
  return n;
}

module.exports = { garderSeulement };
