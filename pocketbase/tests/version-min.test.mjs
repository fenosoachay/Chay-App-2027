// 1.4.0 : refus des anciennes versions de l'appli Android (pb_hooks/lib/versionMin.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';

const { estAncienneAppli, reponse } = chargerLib('versionMin.js');
const UA_ANCIENNE = 'Mozilla/5.0 (Linux; Android 14; Pixel 6 Build/AP2A; wv) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36';
const UA_NOUVELLE = `${UA_ANCIENNE} ChayApp/1.4`;

test('appli Android avant 1.4.0 : refusée', () => assert.equal(estAncienneAppli('https://localhost', UA_ANCIENNE), true));
test('appli Android 1.4.0 et suivantes : acceptée', () => assert.equal(estAncienneAppli('https://localhost', UA_NOUVELLE), false));
test('site membres.chay.fr : jamais refusé', () => assert.equal(estAncienneAppli('https://membres.chay.fr', UA_ANCIENNE), false));
test('appel du téléphone sans origine (widget, réponse rapide) : jamais refusé', () => assert.equal(estAncienneAppli('', UA_ANCIENNE), false));
test('réponse 426 avec message en français', () => {
  const r = reponse();
  assert.equal(r.status, 426);
  assert.match(r.message, /Mise à jour obligatoire/);
});
