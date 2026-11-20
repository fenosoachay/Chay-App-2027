// Niveaux des comptes (Tout le monde / Membre / VIP) : Admin › Équipe › Gérer les membres.
//  - POST /api/fn/listerNiveaux  (admin) : tous les comptes avec leur niveau ;
//  - POST /api/fn/definirNiveau  (admin) : { user_id, niveau: "tous" | "membre" | "vip" }.
// Un membre ne peut pas changer son propre niveau (règle de mise à jour de users, migrer-1-3-21).
// Qui voit quoi : règles des collections (champ audience) ; notifications : lib/notifications.js (peutVoir).

routerAdd('POST', '/api/fn/listerNiveaux', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'listerNiveaux', 'Erreur interne', () => {
    fn.requireAdmin(e, 'Forbidden');
    const rows = $app.findRecordsByFilter('users', "id != ''", '', 0, 0);
    return {
      membres: rows.map((r) => ({
        id: r.id,
        prenom: r.getString('first_name') || '',
        nom: r.getString('last_name') || '',
        email: r.email() || '',
        photo: r.getString('profile_photo_url') || '',
        role: r.getString('role') || 'user',
        niveau: r.getString('niveau') || 'tous',
      })),
    };
  });
});

routerAdd('POST', '/api/fn/definirNiveau', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'definirNiveau', 'Niveau non enregistré', () => {
    fn.requireAdmin(e, 'Forbidden');
    const body = fn.readBody(e);
    const userId = fn.requireString(body, 'user_id', 'user_id requis', 64);
    const niveau = String(body.niveau || '');
    if (['tous', 'membre', 'vip'].indexOf(niveau) === -1) throw new fn.HttpError(400, 'Niveau invalide');
    const u = fn.findById('users', userId);
    if (!u) throw new fn.HttpError(404, 'Compte introuvable');
    u.set('niveau', niveau);
    $app.save(u);
    return { ok: true, niveau };
  });
});
