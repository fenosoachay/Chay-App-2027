// publier-apk.mjs : APK SYNTHÉTIQUES (archives ZIP construites ici), aucun réseau, aucun serveur.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { commandes, controlerApk, lireZip, main, signatureApk, versionGradle } from '../scripts/publier-apk.mjs';

/** Archive ZIP minimale ; `signature` : null (non signé), 'release' ou 'debug' (bloc APK v2 avant le répertoire). */
function apk(fichiers, { signature = 'release' } = {}) {
  const locaux = [];
  const centraux = [];
  let offset = 0;
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const data = Buffer.from(contenu);
    const comp = zlib.deflateRawSync(data);
    const n = Buffer.from(nom);
    const crc = zlib.crc32(data);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locaux.push(l, n, comp);
    centraux.push(c, n);
    offset += 30 + n.length + comp.length;
  }
  let bloc = Buffer.alloc(0);
  if (signature) {
    const cert = Buffer.from(signature === 'debug' ? 'CN=Android Debug,O=Android,C=US' : 'CN=Eglise Chay,O=Chay,C=FR');
    const paire = Buffer.alloc(12); paire.writeBigUInt64LE(BigInt(4 + cert.length), 0); paire.writeUInt32LE(0x7109871a, 8);
    const corps = Buffer.concat([paire, cert]);
    const taille = BigInt(corps.length + 8 + 16);
    const t1 = Buffer.alloc(8); t1.writeBigUInt64LE(taille);
    const t2 = Buffer.alloc(8); t2.writeBigUInt64LE(taille);
    bloc = Buffer.concat([t1, corps, t2, Buffer.from('APK Sig Block 42', 'latin1')]);
  }
  const cd = Buffer.concat(centraux);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(fichiers).length, 8); e.writeUInt16LE(Object.keys(fichiers).length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset + bloc.length, 16);
  return Buffer.concat([...locaux, bloc, cd, e]);
}
const BASE = {
  'AndroidManifest.xml': 'binaire',
  'assets/capacitor.config.json': JSON.stringify({ appId: 'io.chay.app', server: { androidScheme: 'https', allowNavigation: [] } }),
  'assets/public/index.html': '<html></html>',
  'assets/public/assets/base44Client-abc.js': 'const u="https://api.chay.fr";const lib=s=>s.startsWith("127.0.0.1:")',
};

test('APK release valide : accepté, taille et sha256', () => {
  const buf = apk(BASE);
  const r = controlerApk(buf);
  assert.equal(r.taille, buf.length);
  assert.equal(r.sha256, crypto.createHash('sha256').update(buf).digest('hex'));
});

test('lecture ZIP : fichiers compressés relus à l\'identique', () => {
  const { entrees } = lireZip(apk(BASE));
  assert.equal(entrees.get('assets/public/index.html').lire().toString(), '<html></html>');
});

test('signature : absente, debug, release', () => {
  const sans = apk(BASE, { signature: null });
  assert.deepEqual(signatureApk(sans, lireZip(sans).debutRepertoire), { present: false, debug: false });
  const dbg = apk(BASE, { signature: 'debug' });
  assert.deepEqual(signatureApk(dbg, lireZip(dbg).debutRepertoire), { present: true, debug: true });
  assert.throws(() => controlerApk(sans), /non signé/);
  assert.throws(() => controlerApk(dbg), /clé de DEBUG/);
});

test('refus : adresses de bac à sable ou de développement, API absente, server.url, pas un APK', () => {
  for (const mauvais of ['http://127.0.0.1:8090', 'http://localhost:5173', 'http://10.0.2.2:8090', 'test1@chay.test']) {
    assert.throws(() => controlerApk(apk({ ...BASE, 'assets/public/assets/x.js': `const a="${mauvais}"` })), /bac à sable ou de développement/, mauvais);
  }
  assert.throws(() => controlerApk(apk({ ...BASE, 'assets/public/assets/base44Client-abc.js': 'const u="https://exemple.org"' })), /ne vise https:\/\/api\.chay\.fr/);
  assert.throws(() => controlerApk(apk({ ...BASE, 'assets/capacitor.config.json': JSON.stringify({ server: { url: 'http://192.168.1.10:5173' } }) })), /server\.url/);
  assert.throws(() => controlerApk(apk({ ...BASE, 'assets/capacitor.config.json': JSON.stringify({ server: { cleartext: true } }) })), /non chiffré/);
  assert.throws(() => controlerApk(Buffer.from('pas une archive')), /pas une archive APK/);
  const { 'AndroidManifest.xml': _m, ...sansManifest } = BASE;
  assert.throws(() => controlerApk(apk(sansManifest)), /AndroidManifest/);
});

test('version lue dans build.gradle', () => {
  assert.deepEqual(versionGradle('versionCode 4\n        versionName "1.3"'), { versionName: '1.3', versionCode: 4 });
  const reel = versionGradle(fs.readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8'));
  assert.deepEqual(reel, { versionName: '1.3.2', versionCode: 6 });
});

test('main : latest.json écrit, commandes avec clé SSH seulement, sans mot de passe', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-publier-apk-'));
  try {
    const f = path.join(dir, 'app-release.apk');
    const buf = apk(BASE);
    fs.writeFileSync(f, buf);
    const lignes = [];
    const r = main([f, '--sortie', dir, '--cle-ssh', 'C:\\Users\\moi\\.ssh\\id_ed25519'], { log: (l) => lignes.push(l) });
    const lu = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8'));
    assert.equal(lu.versionName, '1.3.2');
    assert.equal(lu.versionCode, 6);
    assert.equal(lu.sha256, crypto.createHash('sha256').update(buf).digest('hex'));
    assert.ok(lu.tailleMo >= 0 && !Number.isNaN(Date.parse(lu.date)));
    assert.deepEqual(r.latest, lu);
    const cmds = lignes.join('\n');
    assert.match(cmds, /scp -o BatchMode=yes -i "C:\\Users\\moi\\.ssh\\id_ed25519" ".*app-release\.apk" "\$\{SERVEUR\}:\/tmp\/chay\.apk\.nouveau"/);
    assert.match(cmds, /sudo mv -f \/srv\/chay-app\/telechargements\/chay\.apk\.nouveau \/srv\/chay-app\/telechargements\/chay\.apk/);
    assert.match(cmds, /install -o root -g root -m 644 \/tmp\/latest\.json\.nouveau/);
    assert.ok(cmds.indexOf('chay.apk.nouveau /srv') < cmds.indexOf('/tmp/latest.json.nouveau /srv'), 'APK en place AVANT latest.json');
    assert.doesNotMatch(cmds, /sshpass|password|-pw\b|PasswordAuthentication=yes/i);
    assert.ok(cmds.includes(lu.sha256));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('commandes : serveur explicite', () => {
  const c = commandes({ apk: 'a.apk', latest: 'l.json', serveur: 'chay@exemple.org', cleSsh: null, sha256: 'x' }).join('\n');
  assert.match(c, /scp -o BatchMode=yes "a\.apk" "chay@exemple\.org:\/tmp\/chay\.apk\.nouveau"/);
  assert.match(c, /ssh -t -o BatchMode=yes "chay@exemple\.org"/);
});
