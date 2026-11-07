// Bloc 3 : authentification et comptes.
//  - connexion par mot de passe refusée tant que l'e-mail n'est pas vérifié (message identique à un échec) ;
//  - le code à usage unique (OTP) vérifie l'e-mail ;
//  - routes deleteMyAccount, deleteUserAccount (admin), inviteUser (admin) ;
//  - page de confirmation du changement d'e-mail (GET /confirmer-email).

// ── Connexion par mot de passe : compte vérifié obligatoire ──────────────────
// PocketBase renvoie « Failed to authenticate. » (400) pour un mauvais identifiant ou mot de passe :
// on renvoie EXACTEMENT la même réponse pour un compte non vérifié (pas d'énumération).
onRecordAuthWithPasswordRequest((e) => {
  // Compte non vérifié ou désactivé : même réponse qu'un mauvais mot de passe (l'authRule
  // « disabled != true » répondrait sinon un message différent, qui révélerait l'état du compte).
  if (e.record && (!e.record.getBool('verified') || e.record.getBool('disabled'))) {
    throw new BadRequestError('Failed to authenticate.');
  }
  e.next();
}, 'users');

// ── Code à usage unique (inscription) ────────────────────────────────────────
// Constaté dans le bac à sable : quand un compte NON vérifié se connecte par code, PocketBase le marque
// vérifié et remplace son mot de passe par un mot de passe aléatoire (protection contre un compte
// pré-enregistré par un tiers avec l'adresse de la victime). On note alors, pour 10 minutes, que ce
// compte peut définir son mot de passe une fois (route setSignupPassword) : seule la personne qui
// vient de prouver l'adresse par le code peut le faire.
onRecordAuthWithOTPRequest((e) => {
  const wasVerified = e.record ? e.record.getBool('verified') : true;
  e.next();
  if (!wasVerified && e.record) {
    $app.store().set(`signup_pwd:${e.record.id}`, Date.now() + 10 * 60 * 1000);
  }
}, 'users');

routerAdd('POST', '/api/fn/setSignupPassword', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'setSignupPassword', 'Erreur interne', () => {
    const me = fn.requireUser(e, 'Connexion requise');
    const body = fn.readBody(e);
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8 || password.length > 72) {
      throw new fn.HttpError(400, 'Le mot de passe doit contenir entre 8 et 72 caractères.');
    }
    const key = `signup_pwd:${me.id}`;
    const until = $app.store().get(key);
    if (!until || Number(until) < Date.now()) throw new fn.HttpError(403, 'Mot de passe déjà défini ou délai dépassé : utilisez « Mot de passe oublié ».');
    $app.store().remove(key); // usage unique
    const record = $app.findRecordById('users', me.id);
    record.setPassword(password);
    $app.save(record);
    // Le changement de mot de passe invalide les sessions : on renvoie une nouvelle session.
    return { token: record.newAuthToken(), record: fn.plain(record) };
  });
});

// ── deleteMyAccount : suppression de son propre compte ──────────────────────
routerAdd('POST', '/api/fn/deleteMyAccount', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const acc = require(`${__hooks}/lib/accounts.js`);
  return fn.run(e, 'deleteMyAccount', 'Erreur interne', () => {
    const me = fn.requireUser(e, 'Connexion requise');
    return fn.tx((txApp) => {
      if (me.getString('role') === 'admin' && acc.remainingAdmins(txApp, me.id) < 1) {
        return fn.fail(409, 'Impossible de supprimer le dernier administrateur.');
      }
      const summary = acc.deleteAccount(txApp, me.id);
      return fn.ok(Object.assign({ ok: true }, summary));
    });
  });
});

// ── deleteUserAccount : suppression d'un membre par un admin ─────────────────
// Seuls les comptes de la collection users sont visés : un superuser ne peut jamais être supprimé ici.
routerAdd('POST', '/api/fn/deleteUserAccount', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  const acc = require(`${__hooks}/lib/accounts.js`);
  return fn.run(e, 'deleteUserAccount', 'Erreur interne', () => {
    fn.requireAdmin(e, 'Forbidden');
    const body = fn.readBody(e);
    const userId = typeof body.user_id === 'string' && body.user_id.length <= 64 ? body.user_id : '';
    if (!userId) throw new fn.HttpError(400, 'user_id requis');
    return fn.tx((txApp) => {
      let target = null;
      try { target = txApp.findRecordById('users', userId); } catch (_) { target = null; }
      if (!target) return fn.fail(404, 'Utilisateur introuvable');
      if (target.getString('role') === 'admin' && acc.remainingAdmins(txApp, userId) < 1) {
        return fn.fail(409, 'Impossible de supprimer le dernier administrateur.');
      }
      const summary = acc.deleteAccount(txApp, userId);
      return fn.ok(Object.assign({ ok: true }, summary));
    });
  });
});

// ── inviteUser : invitation (ou promotion) par un admin ──────────────────────
// Compte existant : rôle mis à jour. Sinon : compte créé (mot de passe aléatoire inconnu de tous),
// puis e-mail « définir votre mot de passe » (lien de réinitialisation à usage unique).
routerAdd('POST', '/api/fn/inviteUser', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'inviteUser', 'Erreur interne', () => {
    fn.requireAdmin(e, 'Forbidden');
    const body = fn.readBody(e);
    const email = typeof body.user_email === 'string' ? body.user_email.trim().toLowerCase() : '';
    const role = body.role === undefined ? 'user' : body.role;
    if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new fn.HttpError(400, 'E-mail invalide');
    if (['admin', 'user', 'moderator'].indexOf(role) === -1) throw new fn.HttpError(400, 'Rôle invalide');

    let user = null;
    try { user = $app.findAuthRecordByEmail('users', email); } catch (_) { user = null; }
    if (user) {
      user.set('role', role);
      $app.save(user);
      return { ok: true, invited: false };
    }
    user = fn.newRecord($app, 'users', { email, role, verified: false, emailVisibility: false });
    user.setPassword($security.randomString(40));
    $app.save(user);
    $mails.sendRecordPasswordReset($app, user);
    return { ok: true, invited: true };
  });
});

// ── Page de confirmation du changement d'e-mail ─────────────────────────────
// Le lien de l'e-mail pointe ici ; la page demande le mot de passe (exigé par PocketBase)
// puis appelle POST /api/collections/users/confirm-email-change.
routerAdd('GET', '/confirmer-email', (e) => {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Confirmer mon adresse e-mail</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#1f2937}
input,button{width:100%;padding:10px;margin:8px 0;font-size:16px;box-sizing:border-box}button{background:#4A6CFE;color:#fff;border:0;border-radius:8px}
#msg{margin-top:12px}</style></head>
<body><h1>Confirmer ma nouvelle adresse e-mail</h1>
<p>Pour terminer le changement d’adresse, saisissez votre mot de passe actuel.</p>
<form id="f"><input id="p" type="password" placeholder="Mot de passe" autocomplete="current-password" required>
<button type="submit">Confirmer</button></form><p id="msg"></p>
<script>
const token = new URLSearchParams(location.search).get('token') || '';
document.getElementById('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = document.getElementById('msg');
  const res = await fetch('/api/collections/users/confirm-email-change', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password: document.getElementById('p').value }),
  });
  msg.textContent = res.ok
    ? 'Votre adresse e-mail a été modifiée. Vous pouvez vous reconnecter avec la nouvelle adresse.'
    : 'Le lien est invalide ou expiré, ou le mot de passe est incorrect.';
});
</script></body></html>`;
  return e.html(200, html);
});

// ── Page de confirmation de l'adresse e-mail (lien de vérification, secours de l'OTP) ──
routerAdd('GET', '/confirmer-verification', (e) => {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vérification de l’adresse e-mail</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#1f2937}</style></head>
<body><h1>Vérification de l’adresse e-mail</h1><p id="msg">Vérification en cours…</p>
<script>
const token = new URLSearchParams(location.search).get('token') || '';
fetch('/api/collections/users/confirm-verification', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
}).then((res) => {
  document.getElementById('msg').textContent = res.ok
    ? 'Votre adresse e-mail est vérifiée. Vous pouvez vous connecter dans l’application.'
    : 'Le lien est invalide ou expiré.';
});
</script></body></html>`;
  return e.html(200, html);
});
