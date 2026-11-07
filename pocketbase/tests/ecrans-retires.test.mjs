// Écrans Base44 non migrés (MFA, OAuthConsent) : absents du mode PocketBase.
// Ils ne sont routés nulle part (App.jsx) ni importés : Vite ne les embarque donc dans aucun build.
// Ce test échoue si un fichier de src/ se met à les importer (il faudrait alors les exclure du mode
// PocketBase, comme le reste de l'authentification Base44). Les fichiers eux-mêmes restent en place
// pour le mode Base44. Lancement : node --test pocketbase/tests/ecrans-retires.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const RETIRES = ['pages/Mfa', 'pages/OAuthConsent', 'lib/authMfa', 'lib/authMfaFlow', 'components/MfaFlow', 'components/MfaManage', 'components/MfaMethodSetup', 'components/MfaParts'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

test('aucun fichier de src/ n’importe les écrans MFA / OAuthConsent', () => {
  const own = new Set(RETIRES.flatMap((r) => ['.js', '.jsx'].map((ext) => path.join(SRC, r + ext))));
  const offenders = [];
  for (const file of walk(SRC).filter((f) => /\.(jsx?|tsx?)$/.test(f) && !own.has(f))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const r of RETIRES) {
      const name = r.split('/').pop();
      if (new RegExp(`from\\s+['"][^'"]*/${name}(\\.jsx?)?['"]|import\\(\\s*['"][^'"]*/${name}(\\.jsx?)?['"]`).test(text)) offenders.push(`${path.relative(SRC, file)} -> ${r}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('aucune route vers /mfa ou /oauth dans App.jsx', () => {
  const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
  assert.doesNotMatch(app, /path=["'][^"']*(mfa|oauth|consent)/i);
});
