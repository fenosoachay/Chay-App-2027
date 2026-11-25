import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { octetsLisibles } from "./stockage.js";

test("1.3.34 : tailles lisibles", () => {
  assert.equal(octetsLisibles(500), "500 o");
  assert.equal(octetsLisibles(1536), "1,5 Ko");
  assert.equal(octetsLisibles(25 * 1024 * 1024), "25 Mo");
  assert.equal(octetsLisibles(-1), "—");
});

test("1.3.34 : Paramètres sans doublons ; Stockage et données, À propos", () => {
  const s = fs.readFileSync(new URL("../pages/Settings.jsx", import.meta.url), "utf8");
  const titres = [...s.matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(titres, ["Mon compte", "Sécurité et connexion", "Notifications", "Affichage et accessibilité", "Mon parcours spirituel", "Confidentialité et données", "Stockage et données", "Aide", "À propos"]);
  const d = fs.readFileSync(new URL("../components/settings/DisplaySection.jsx", import.meta.url), "utf8");
  assert.equal((d.match(/Contraste renforcé/g) || []).length, 1);
  assert.doesNotMatch(d, /autoplay_/);
});
