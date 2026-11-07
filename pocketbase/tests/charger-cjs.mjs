// Charge un module CommonJS de pb_hooks/lib (écrit pour le JSVM de PocketBase) dans Node.
// Le dépôt est en "type": "module" : require() traiterait le fichier comme un module ES.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pb_hooks', 'lib');

export function chargerLib(nom) {
  const source = fs.readFileSync(path.join(LIB, nom), 'utf8');
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', source)(module, module.exports, (m) => {
    throw new Error(`require(${m}) indisponible hors de PocketBase`);
  });
  return module.exports;
}
