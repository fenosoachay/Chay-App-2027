// Signature SigV4 en JavaScript pur (pb_hooks/lib/sigv4.js) :
//  1. vecteurs officiels (NIST pour SHA-256, RFC 4231 pour HMAC, documentation AWS pour SigV4 / S3) ;
//  2. comparaison avec node:crypto sur des entrées aléatoires.
// Aucun réseau. Lancement : node --test pocketbase/tests/sigv4.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { chargerLib } from './charger-cjs.mjs';
import { signature as refSignature } from './sigv4-node.mjs';

const v4 = chargerLib('sigv4.js');

// Clés d'EXEMPLE publiées par AWS dans sa documentation (pas des secrets).
const AKID = 'AKIAIOSFODNN7EXAMPLE';
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const HOST = 'examplebucket.s3.amazonaws.com';
const DATE = '20130524T000000Z';
const S3 = { accessKeyId: AKID, secretAccessKey: SECRET, region: 'us-east-1', service: 's3', amzDate: DATE };
const sigOf = (headers) => /Signature=([0-9a-f]{64})/.exec(headers.authorization)[1];

test('SHA-256 : vecteurs NIST', () => {
  assert.equal(v4.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(v4.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(v4.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
});

test('HMAC-SHA256 : RFC 4231, cas 2', () => {
  assert.equal(v4.hex(v4.hmac('Jefe', 'what do ya want for nothing?')),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('AWS : dérivation de la clé de signature (exemple IAM de la documentation)', () => {
  assert.equal(v4.hex(v4.signingKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20120215', 'us-east-1', 'iam')),
    'f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d');
});

test('AWS S3 : GET Object avec Range (en-tête Authorization)', () => {
  const h = v4.signHeaders({ ...S3, method: 'GET', host: HOST, path: '/test.txt', headers: { range: 'bytes=0-9' } });
  assert.equal(sigOf(h), 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.match(h.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
});

test('AWS S3 : PUT Object (corps signé, caractère $ dans la clé)', () => {
  const body = 'Welcome to Amazon S3.';
  const h = v4.signHeaders({
    ...S3, method: 'PUT', host: HOST, path: '/test$file.text', body,
    headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
  });
  assert.equal(h['x-amz-content-sha256'], '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
  assert.equal(sigOf(h), '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
});

test('AWS S3 : GET Bucket lifecycle (paramètre de query sans valeur)', () => {
  const h = v4.signHeaders({ ...S3, method: 'GET', host: HOST, path: '/', query: { lifecycle: '' } });
  assert.equal(sigOf(h), 'fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543');
});

test('AWS S3 : GET Bucket (list objects, query triée)', () => {
  const h = v4.signHeaders({ ...S3, method: 'GET', host: HOST, path: '/', query: { prefix: 'J', 'max-keys': '2' } });
  assert.equal(sigOf(h), '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
});

test('AWS S3 : URL présignée (query string, 86400 s)', () => {
  const url = v4.presign({ ...S3, method: 'GET', host: HOST, path: '/test.txt', expires: 86400 });
  assert.equal(new URL(url).searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});

test('SHA-256 et HMAC : 2 000 entrées aléatoires identiques à node:crypto (frontières de blocs, UTF-8)', () => {
  const lengths = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096];
  for (let i = 0; i < 1000; i++) {
    const len = i < lengths.length ? lengths[i] : crypto.randomInt(0, 600);
    const data = crypto.randomBytes(len);
    assert.equal(v4.sha256Hex(data), crypto.createHash('sha256').update(data).digest('hex'), `sha256 longueur ${len}`);
    const key = crypto.randomBytes(crypto.randomInt(0, 200)); // > 64 octets : clé hachée
    assert.equal(v4.hex(v4.hmac(key, data)), crypto.createHmac('sha256', key).update(data).digest('hex'), `hmac clé ${key.length}`);
  }
  const texts = ['', 'é', 'Église Chay ✝️', '日本語', '😀 emoji', 'a'.repeat(200) + 'ü'];
  for (let i = 0; i < 1000; i++) {
    const s = texts[i % texts.length] + crypto.randomBytes(crypto.randomInt(0, 40)).toString('base64');
    assert.equal(v4.sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('SigV4 complète : 300 requêtes aléatoires, signature identique à l’implémentation node:crypto', () => {
  const chars = 'abcXYZ019-_.~ /éàçü+=&?%$@!*()[]';
  const rnd = (n) => Array.from({ length: n }, () => chars[crypto.randomInt(0, chars.length)]).join('');
  for (let i = 0; i < 300; i++) {
    const secret = crypto.randomBytes(30).toString('base64');
    const path = `/chay-videos/videos/${rnd(crypto.randomInt(1, 30))}.mp4`;
    const query = { partNumber: String(crypto.randomInt(1, 10000)), uploadId: rnd(20), [rnd(5) || 'k']: rnd(8) };
    const date = new Date(Date.UTC(2020 + crypto.randomInt(0, 10), crypto.randomInt(0, 12), 1 + crypto.randomInt(0, 28), crypto.randomInt(0, 24)));
    const amzDate = v4.amzDates(date).amzDate;
    const body = i % 2 ? `<CompleteMultipartUpload>${rnd(50)}</CompleteMultipartUpload>` : '';
    const h = v4.signHeaders({ method: i % 3 ? 'POST' : 'GET', host: 'abc.r2.cloudflarestorage.com', path, query, body, accessKeyId: 'K', secretAccessKey: secret, region: 'auto', service: 's3', amzDate });
    const ref = refSignature({
      method: i % 3 ? 'POST' : 'GET', path, queryPairs: Object.entries(query),
      headers: { host: 'abc.r2.cloudflarestorage.com', ...h }, signedHeaders: 'host;x-amz-content-sha256;x-amz-date',
      payloadHash: h['x-amz-content-sha256'], amzDate, region: 'auto', service: 's3', secret,
    });
    assert.equal(sigOf(h), ref.signature, `requête ${i}`);

    const url = new URL(v4.presign({ method: 'PUT', protocol: 'http:', host: '127.0.0.1:9000', path, query, headers: { 'content-length': '8388608' }, expires: 900, accessKeyId: 'K', secretAccessKey: secret, amzDate }));
    const pairs = [...url.searchParams.entries()].filter(([k]) => k !== 'X-Amz-Signature');
    const refP = refSignature({
      // chemin d'origine : l'objet URL de Node normalise les segments « /./ » (les clés générées n'en ont pas)
      method: 'PUT', path, queryPairs: pairs,
      headers: { host: '127.0.0.1:9000', 'content-length': '8388608' }, signedHeaders: 'content-length;host',
      payloadHash: 'UNSIGNED-PAYLOAD', amzDate, region: 'auto', service: 's3', secret,
    });
    assert.equal(url.searchParams.get('X-Amz-Signature'), refP.signature, `présignée ${i}`);
  }
});
