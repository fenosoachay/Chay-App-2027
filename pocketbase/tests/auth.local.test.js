// Bout en bout « authentification » avec le VRAI adaptateur, le VRAI SDK PocketBase,
// le bac à sable local et le faux SMTP local (aucun e-mail réel).
// Reproduit les écrans Register.jsx, ForgotPassword.jsx, ResetPassword.jsx, SecuritySection.jsx et DangerZone.
import crypto from 'node:crypto';
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { otpFrom, tokenFrom, waitForMail } from './lib.mjs';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const creds = Object.fromEntries(fs.readFileSync(process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt', 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password] = l.split('\t'); return [k, { email, password }]; }));

const client = () => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  return createPocketBaseAdapter(pb, { baseUrl: BASE });
};

describe('authentification en mode PocketBase (bac à sable + faux SMTP)', () => {
  const email = `e2e-${crypto.randomBytes(5).toString('hex')}@chay.test`;
  const password = `${crypto.randomBytes(9).toString('base64url')}A1`;
  let newPassword;
  let su;

  beforeAll(async () => {
    su = new PocketBase(BASE);
    await retry429(() => su.collection('_superusers').authWithPassword(creds.superuser.email, creds.superuser.password));
  });

  afterAll(async () => {
    const left = await su.collection('users').getFullList({ filter: su.filter('email = {:e}', { e: email }), fields: 'id' });
    for (const u of left) await su.collection('users').delete(u.id);
  });

  it('inscription (Register.jsx) : e-mail capturé -> code -> connecté avec le rôle « user »', async () => {
    const app = client();
    const since = Date.now() - 1000;
    await retry429(() => app.auth.register({ email, password }));
    const code = otpFrom((await waitForMail(email, since, 10000, /Voici votre code/)).text);
    expect(code).toMatch(/^\d{6}$/);
    const res = await retry429(() => app.auth.verifyOtp({ email, otpCode: code }));
    expect(res.access_token).toBeTruthy();
    app.auth.setToken(res.access_token);
    await app.auth.updateMe({ first_name: 'Test', last_name: 'E2E', city: 'Paris' });
    const me = await app.auth.me();
    expect(me).toMatchObject({ role: 'user', first_name: 'Test', city: 'Paris', verified: true });
  });

  it('connexion par mot de passe avec celui choisi à l’inscription', async () => {
    const res = await retry429(() => client().auth.loginViaEmailPassword(email, password));
    expect(res.user.email).toBe(email);
  });

  it('mot de passe oublié -> lien -> nouveau mot de passe -> connexion', async () => {
    const since = Date.now() - 1000;
    await retry429(() => client().auth.resetPasswordRequest(email));
    const token = tokenFrom((await waitForMail(email, since, 10000, /reset-password/)).text);
    newPassword = `${crypto.randomBytes(9).toString('base64url')}B2`;
    await retry429(() => client().auth.resetPassword({ resetToken: token, newPassword }));
    await expect(retry429(() => client().auth.resetPassword({ resetToken: token, newPassword: `${newPassword}x` }))).rejects.toMatchObject({ message: /invalide ou expiré/ });
    const ok = await retry429(() => client().auth.loginViaEmailPassword(email, newPassword));
    expect(ok.access_token).toBeTruthy();
    await expect(retry429(() => client().auth.loginViaEmailPassword(email, password))).rejects.toMatchObject({ message: 'E-mail ou mot de passe incorrect.' });
  });

  it('changement d’e-mail (SecuritySection) : demande de confirmation envoyée à la nouvelle adresse', async () => {
    const app = client();
    await retry429(() => app.auth.loginViaEmailPassword(email, newPassword));
    const target = `e2e-nouvelle-${crypto.randomBytes(4).toString('hex')}@chay.test`;
    const since = Date.now() - 1000;
    await app.auth.updateMe({ email: target });
    expect(tokenFrom((await waitForMail(target, since, 10000, /confirmer-email/)).text)).toBeTruthy();
    expect((await app.auth.me()).email).toBe(email); // pas de changement tant que ce n'est pas confirmé
  });

  it('suppression du compte (DangerZone) : compte supprimé, connexion impossible', async () => {
    const app = client();
    await retry429(() => app.auth.loginViaEmailPassword(email, newPassword));
    const me = await app.auth.me();
    const res = await app.entities.User.delete(me.id);
    expect(res).toMatchObject({ deleted: true, ok: true });
    await expect(retry429(() => client().auth.loginViaEmailPassword(email, newPassword))).rejects.toMatchObject({ message: 'E-mail ou mot de passe incorrect.' });
  });
});
