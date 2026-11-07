// Bloc 5, sans réseau : cryptographie du sidecar push, fuseaux horaires du verset du jour, e-mails.
// Lancement : node --test pocketbase/tests/push.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  b64u, checkVapid, decryptWebPush, encryptWebPush, fromB64u, parseServiceAccount, sameSecret, serviceAccountJwt, vapidAuthorization,
} from '../sidecar-push/crypto-push.mjs';
import { chargerLib } from './charger-cjs.mjs';

const fuseaux = chargerLib('fuseaux.js');
const courriel = chargerLib('courriel.js');

test('Web Push : vecteur officiel de la RFC 8291 (annexe A)', () => {
  const out = encryptWebPush('When I grow up, I want to be a watermelon',
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
    { salt: 'DGv6ra1nlYgDCS1FRnbzlw', asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' });
  assert.equal(b64u(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  assert.equal(decryptWebPush(out, 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', 'BTBZMqHH6r4Tts7J_aSIgg').toString(), 'When I grow up, I want to be a watermelon');
});

test('Web Push : aller-retour avec clés aléatoires, sel et clé éphémère différents à chaque envoi', () => {
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = b64u(crypto.randomBytes(16));
  const msg = JSON.stringify({ title: 'Église', body: 'é'.repeat(300) });
  const a = encryptWebPush(msg, b64u(ua.getPublicKey()), auth);
  const b = encryptWebPush(msg, b64u(ua.getPublicKey()), auth);
  assert.notEqual(b64u(a), b64u(b));
  assert.equal(decryptWebPush(a, b64u(ua.getPrivateKey()), auth).toString(), msg);
  assert.throws(() => encryptWebPush('x', 'AAAA', auth), /p256dh/);
  assert.throws(() => encryptWebPush('x'.repeat(5000), b64u(ua.getPublicKey()), auth), /trop grande/);
});

test('VAPID : JWT ES256 vérifiable avec la clé k, aud = origine, exp <= 24 h ; paire contrôlée', () => {
  const k = crypto.createECDH('prime256v1');
  k.generateKeys();
  const pub = b64u(k.getPublicKey());
  const priv = b64u(k.getPrivateKey());
  assert.equal(checkVapid(pub, priv), null);
  const other = crypto.createECDH('prime256v1');
  other.generateKeys();
  assert.equal(checkVapid(b64u(other.getPublicKey()), priv), 'vapid_key_mismatch');
  assert.equal(checkVapid('', priv), 'no_vapid_key');
  const h = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', 'mailto:x@chay.fr', pub, priv, 1000);
  const [, jwt, kk] = /^vapid t=([^,]+), k=(.+)$/.exec(h);
  assert.equal(kk, pub);
  const [hh, pp, ss] = jwt.split('.');
  const payload = JSON.parse(fromB64u(pp));
  assert.deepEqual(payload, { aud: 'https://fcm.googleapis.com', exp: 1000 + 12 * 3600, sub: 'mailto:x@chay.fr' });
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(k.getPublicKey().subarray(1, 33)), y: b64u(k.getPublicKey().subarray(33)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${hh}.${pp}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64u(ss)));
});

test('FCM : assertion RS256 du compte de service vérifiable, champs exigés par Google', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { project_id: 'p', client_email: 'svc@p.iam.gserviceaccount.com', private_key_id: 'kid', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const jwt = serviceAccountJwt(sa, 5000);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(fromB64u(h)), { alg: 'RS256', typ: 'JWT', kid: 'kid' });
  assert.deepEqual(JSON.parse(fromB64u(p)), { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: 5000, exp: 8600 });
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, fromB64u(s)));
  assert.equal(parseServiceAccount(JSON.stringify(sa)).error, null);
  assert.equal(parseServiceAccount('').error, 'FIREBASE_SERVICE_ACCOUNT manquant');
  assert.match(parseServiceAccount('{"project_id":"p"}').error, /client_email/);
  assert.match(parseServiceAccount('/nulle/part.json', () => { throw new Error('x'); }).error, /illisible/);
});

test('secret partagé : comparaison à temps constant, vide refusé', () => {
  assert.ok(sameSecret('abc', 'abc'));
  assert.ok(!sameSecret('abc', 'abd'));
  assert.ok(!sameSecret('', ''));
  assert.ok(!sameSecret(undefined, 'abc'));
});

test('fuseaux : heure d\'été / d\'hiver de Paris aux changements d\'heure', () => {
  const p = (iso) => fuseaux.localParts(Date.parse(iso), 'Europe/Paris');
  // 2026 : heure d'été du 29 mars 01:00 UTC au 25 octobre 01:00 UTC
  assert.equal(p('2026-03-29T00:59:00Z').hhmm, '01:59');
  assert.equal(p('2026-03-29T01:00:00Z').hhmm, '03:00');
  assert.equal(p('2026-10-25T00:59:00Z').hhmm, '02:59');
  assert.equal(p('2026-10-25T01:00:00Z').hhmm, '02:00');
  // le verset (07:00 à Paris) : 05:00 UTC en été, 06:00 UTC en hiver
  assert.equal(p('2026-07-01T05:00:00Z').hhmm, '07:00');
  assert.equal(p('2026-12-01T06:00:00Z').hhmm, '07:00');
  assert.equal(p('2026-12-01T05:00:00Z').hhmm, '06:00');
});

test('fuseaux : jour de la semaine dans le fuseau du membre ; inconnu -> Paris', () => {
  const ms = Date.parse('2026-11-08T05:30:00Z'); // dimanche 06:30 à Paris
  assert.equal(fuseaux.localParts(ms, 'Europe/Paris').weekday, 'sun');
  assert.equal(fuseaux.localParts(ms, 'Indian/Antananarivo').hhmm, '08:30');
  assert.equal(fuseaux.localParts(ms, 'America/Los_Angeles').weekday, 'sat'); // 21:30 la veille
  assert.equal(fuseaux.localParts(ms, 'America/Los_Angeles').hhmm, '21:30');
  assert.equal(fuseaux.localParts(Date.parse('2026-07-01T12:00:00Z'), 'America/New_York').hhmm, '08:00'); // heure d'été
  const unknown = fuseaux.localParts(ms, 'Mars/Olympus');
  assert.equal(unknown.known, false);
  assert.equal(unknown.hhmm, '06:30');
});

test('e-mails : échappement HTML et sujet sur une ligne', () => {
  assert.equal(courriel.escapeHtml('<img src=x onerror="a(\'1\')">&'), '&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;&amp;');
  assert.equal(courriel.cleanSubject('Bonjour\r\nBcc: tous@exemple.fr\u2028x'), 'Bonjour Bcc: tous@exemple.fr x');
  assert.equal(courriel.cleanSubject('x'.repeat(400)).length, 150);
});
