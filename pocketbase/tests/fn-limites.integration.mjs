#!/usr/bin/env node
// Limites de tentatives (bac à sable local). À lancer EN DERNIER : il épuise volontairement les
// compteurs (fenêtre de 60 s) de la connexion, de la demande de code et de la réinitialisation.
import crypto from 'node:crypto';
import { http, makeChecker } from './lib.mjs';

const { check, done } = makeChecker();
const unknown = () => `limite-${crypto.randomBytes(5).toString('hex')}@chay.test`;

async function hammer(label, path, bodyFn, max = 40) {
  const statuses = [];
  for (let i = 0; i < max; i++) {
    const r = await http('POST', path, { body: bodyFn() });
    statuses.push(r.status);
    if (r.status === 429) break;
  }
  const first429 = statuses.indexOf(429);
  check(`${label} : bloqué (429) après ${first429 >= 0 ? first429 : '?'} requêtes`, first429 > 0 && first429 <= 20, statuses.join(','));
  return statuses;
}

console.log('\n■ Limites de tentatives');
await hammer('connexion par mot de passe', '/api/collections/users/auth-with-password', () => ({ identity: unknown(), password: 'x' }));
await hammer('demande de code', '/api/collections/users/request-otp', () => ({ email: unknown() }));
await hammer('demande de réinitialisation', '/api/collections/users/request-password-reset', () => ({ email: unknown() }));
const otp = await hammer('saisie du code', '/api/collections/users/auth-with-otp', () => ({ otpId: 'inexistant', password: '000000' }));
void otp;
console.log('\n(les compteurs se réinitialisent au bout de 60 s)');
done();
