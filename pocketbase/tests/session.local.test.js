// Session contre le BAC À SABLE, avec le vrai adaptateur et le vrai SDK : un jeton réellement refusé par
// PocketBase déconnecte ; un serveur injoignable ne déconnecte pas (jeton conservé).
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { estRevocation } from '@/lib/sessionPolicy';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const credFile = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
const creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password, id] = l.split('\t'); return [k, { email, password, id }]; }));

const connecte = async () => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  const api = createPocketBaseAdapter(pb, { baseUrl: BASE });
  await retry429(() => api.auth.loginViaEmailPassword(creds.membre.email, creds.membre.password));
  return { pb, api };
};

describe('session (bac à sable)', () => {
  it('jeton valide : auth.me() renvoie le profil et prolonge la session', async () => {
    const { api, pb } = await connecte();
    const avant = pb.authStore.token;
    const moi = await retry429(() => api.auth.me());
    expect(moi.id).toBeTruthy();
    expect(pb.authStore.token).toBeTruthy();
    expect(typeof avant).toBe('string');
  });

  it('session expirée réelle (jeton refusé par PocketBase) : révocation, jeton effacé', async () => {
    const { api, pb } = await connecte();
    const [h, , s] = pb.authStore.token.split('.');
    // Charge utile modifiée (expiration passée) : signature invalide -> refus réel du serveur.
    const charge = Buffer.from(JSON.stringify({ id: creds.membre.id || 'x', exp: 1, type: 'auth', collectionId: 'x' })).toString('base64url');
    pb.authStore.save(`${h}.${charge}.${s}`, pb.authStore.record);
    const err = await api.auth.me().catch((e) => e);
    expect(estRevocation(err)).toBe(true);
    expect(pb.authStore.token).toBe('');
  });

  it('serveur injoignable (coupure) : erreur temporaire, jeton CONSERVÉ', async () => {
    const { pb } = await connecte();
    const jeton = pb.authStore.token;
    const hors = new PocketBase('http://127.0.0.1:9'); // port fermé
    hors.autoCancellation(false);
    hors.authStore.save(jeton, pb.authStore.record);
    const apiHors = createPocketBaseAdapter(hors, { baseUrl: 'http://127.0.0.1:9' });
    const err = await apiHors.auth.me().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(estRevocation(err)).toBe(false);
    expect(hors.authStore.token).toBe(jeton);
  });
});
