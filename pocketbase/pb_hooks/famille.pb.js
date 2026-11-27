// Code famille (1.4.1) : faire jouer un enfant sur un autre compte (grand-mère, tante…) avec le MÊME profil.
// Règles et calculs : lib/famille.js ; collections : ProfilEnfant.invites, CodeFamille (scripts/migrer-1-4-1.mjs).
//  - POST /api/fn/codeFamille { id }             -> { code, expire }   parent seulement ; l'ancien code est remplacé ;
//  - POST /api/fn/rejoindreEnfant { code }        -> { profil }        un autre compte ; 8 codes faux par heure au plus ;
//  - POST /api/fn/accesEnfant { id }              -> { comptes: [{ user_id, nom }] }  parent seulement ;
//  - POST /api/fn/retirerAccesEnfant { id, user_id } parent (n'importe quel invité) ou invité (lui-même).

routerAdd('POST', '/api/fn/codeFamille', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const fam = require(`${__hooks}/lib/famille.js`);
  return fn.run(e, 'codeFamille', 'Code non créé', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const id = fn.requireString(fn.readBody(e), 'id', 'id requis', 40);
    const profil = fn.findById('ProfilEnfant', id);
    if (!profil || profil.getString('user_id') !== caller.id) throw new fn.HttpError(404, 'Enfant introuvable');
    let code = '';
    $app.runInTransaction((txApp) => {
      const anciens = txApp.findRecordsByFilter('CodeFamille', 'profil_id = {:p}', '', 0, 0, { p: id });
      for (const r of anciens) txApp.delete(r);
      for (let i = 0; i < 20 && !code; i += 1) {
        const essai = $security.randomStringWithAlphabet(6, '0123456789');
        const pris = txApp.findRecordsByFilter('CodeFamille', 'code = {:c}', '', 1, 0, { c: essai });
        if (!pris.length) code = essai;
      }
      if (!code) throw new fn.HttpError(503, 'Réessaie dans un instant.');
      txApp.save(fn.newRecord(txApp, 'CodeFamille', {
        code, profil_id: id, user_id: caller.id, expire: Date.now() + fam.CODE_DUREE_MS,
      }));
    });
    return { code, expire: new Date(Date.now() + fam.CODE_DUREE_MS).toISOString() };
  });
});

routerAdd('POST', '/api/fn/rejoindreEnfant', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const fam = require(`${__hooks}/lib/famille.js`);
  return fn.run(e, 'rejoindreEnfant', 'Code non accepté', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const maintenant = Date.now();
    const cle = `famille_essais:${caller.id}`;
    const etat = (() => { try { return JSON.parse($app.store().get(cle) || 'null'); } catch (_) { return null; } })();
    if (fam.tropDEssais(etat, maintenant)) throw new fn.HttpError(429, 'Trop d’essais. Réessaie dans une heure.');
    const faux = (message) => {
      $app.store().set(cle, JSON.stringify(fam.essaiSuivant(etat, maintenant)));
      return new fn.HttpError(400, message);
    };
    const code = fam.codeValide(fn.readBody(e).code);
    if (!code) throw faux('Le code a 6 chiffres.');
    const rec = fn.findOne($app, 'CodeFamille', 'code = {:c}', '', { c: code });
    if (!rec || rec.getInt('expire') < maintenant) {
      if (rec) $app.delete(rec);
      throw faux('Code inconnu ou expiré. Demande un nouveau code au parent.');
    }
    const profil = fn.findById('ProfilEnfant', rec.getString('profil_id'));
    if (!profil) { $app.delete(rec); throw faux('Cet enfant n’existe plus.'); }
    const parent = profil.getString('user_id');
    if (parent === caller.id) throw new fn.HttpError(400, 'Cet enfant est déjà sur ton compte.');
    const pseudo = profil.getString('pseudo');
    const homonyme = $app.findRecordsByFilter('ProfilEnfant', 'user_id = {:u}', '', 0, 0, { u: caller.id })
      .some((p) => p.getString('pseudo').toLowerCase() === pseudo.toLowerCase());
    if (homonyme) throw new fn.HttpError(409, `Tu as déjà un enfant nommé ${pseudo} : efface-le d’abord ou choisis un autre prénom.`);
    $app.runInTransaction((txApp) => {
      const p = txApp.findRecordById('ProfilEnfant', profil.id);
      p.set('invites', fam.ajouterInvite(p.getString('invites'), caller.id));
      txApp.save(p);
      txApp.delete(txApp.findRecordById('CodeFamille', rec.id));
    });
    $app.store().remove(cle);
    const u = fn.findById('users', parent);
    const lettre = u ? fam.initialeFamille(u.getString('first_name'), u.getString('last_name'), u.getString('name')) : '';
    return {
      profil: { id: profil.id, pseudo, avatar: profil.getString('avatar'), user_id: parent },
      famille: lettre ? `famille ${lettre}.` : '',
    };
  });
});

routerAdd('POST', '/api/fn/accesEnfant', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const fam = require(`${__hooks}/lib/famille.js`);
  return fn.run(e, 'accesEnfant', 'Liste indisponible', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const id = fn.requireString(fn.readBody(e), 'id', 'id requis', 40);
    const profil = fn.findById('ProfilEnfant', id);
    if (!profil || profil.getString('user_id') !== caller.id) throw new fn.HttpError(404, 'Enfant introuvable');
    const comptes = fam.listeInvites(profil.getString('invites')).map((uid) => {
      const u = fn.findById('users', uid);
      const nom = u ? ([u.getString('first_name'), u.getString('last_name')].filter(Boolean).join(' ') || u.getString('name')) : '';
      return { user_id: uid, nom: nom || 'Compte effacé' };
    });
    return { comptes };
  });
});

routerAdd('POST', '/api/fn/retirerAccesEnfant', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const fam = require(`${__hooks}/lib/famille.js`);
  return fn.run(e, 'retirerAccesEnfant', 'Accès non retiré', () => {
    const caller = fn.requireUser(e, 'Connexion requise');
    const b = fn.readBody(e);
    const id = fn.requireString(b, 'id', 'id requis', 40);
    const cible = fn.requireString(b, 'user_id', 'user_id requis', 40);
    const profil = fn.findById('ProfilEnfant', id);
    const parent = profil ? profil.getString('user_id') : '';
    if (!profil || (caller.id !== parent && caller.id !== cible) || !fam.aAcces(parent, profil.getString('invites'), caller.id)) {
      throw new fn.HttpError(404, 'Enfant introuvable');
    }
    profil.set('invites', fam.retirerInvite(profil.getString('invites'), cible));
    $app.save(profil);
    return { ok: true };
  });
});
