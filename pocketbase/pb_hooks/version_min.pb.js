// 1.4.0 : mise à jour obligatoire côté serveur. Les versions de l'appli Android antérieures à la 1.4.0 reçoivent
// « 426 Mise à jour obligatoire » à chaque demande (règles : lib/versionMin.js). Les demandes de préparation du
// navigateur (OPTIONS) passent toujours. Toute erreur imprévue laisse passer la demande : jamais de blocage par
// accident. Arrêt d'urgence : CHAY_BLOCAGE_VERSIONS=off.
routerUse((e) => {
  let bloquer = false;
  let corps = null;
  try {
    if ($os.getenv('CHAY_BLOCAGE_VERSIONS') !== 'off' && e.request.method !== 'OPTIONS') {
      const lib = require(`${__hooks}/lib/versionMin.js`);
      if (lib.estAncienneAppli(e.request.header.get('Origin'), e.request.header.get('User-Agent'))) {
        bloquer = true;
        corps = lib.reponse();
      }
    }
  } catch (_) {
    bloquer = false;
  }
  if (bloquer) {
    try { e.response.header().set('Access-Control-Allow-Origin', 'https://localhost'); } catch (_) { /* déjà posé */ }
    return e.json(426, corps);
  }
  return e.next();
});
