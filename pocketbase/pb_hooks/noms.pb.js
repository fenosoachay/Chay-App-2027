// Nom affiché (1.3.35) : le prénom et le nom choisis dans Paramètres › Profil sont la seule source.
// Bug corrigé : des comptes créés avec Google gardaient le nom de l'inscription dans `name` (Base44 ne le
// laissait pas modifier), et ce nom revenait dans les messages, les notifications et l'annuaire.
//  - à chaque enregistrement d'un compte (appli, admin, script…), `name` suit « Prénom Nom » ;
//  - après un changement de nom, tous les profils publics (MemberProfile) de ce membre prennent le nouveau nom.
// Hooks « modèle » : ils s'appliquent à toutes les écritures, pas seulement aux requêtes de l'appli.

function synchroniserName(e) {
  const nm = require(`${__hooks}/lib/nouveauxMembres.js`);
  const r = e.record;
  const n = nm.nameASynchroniser(r.getString('first_name'), r.getString('last_name'), r.getString('name'));
  if (n) r.set('name', n);
  e.next();
}
onRecordCreate(synchroniserName, 'users');
onRecordUpdate(synchroniserName, 'users');

onRecordAfterUpdateSuccess((e) => {
  e.next();
  const nm = require(`${__hooks}/lib/nouveauxMembres.js`);
  const u = e.record;
  const nom = nm.nomComplet(u.getString('first_name'), u.getString('last_name'));
  if (!nom) return;
  try {
    const profils = $app.findRecordsByFilter('MemberProfile', 'created_by_id = {:u}', '', 20, 0, { u: u.id });
    for (const p of profils) {
      if (p.getString('display_name') === nom) continue;
      p.set('display_name', nom);
      $app.save(p);
    }
  } catch (_) {
    $app.logger().error('[noms] profil public non mis à jour', 'user', u.id);
  }
}, 'users');
