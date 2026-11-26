import test from "node:test";
import assert from "node:assert/strict";
import { doitBloquer, versionAndroid } from "./majObligatoire.js";

const latest = { versionName: "1.4.1", versionCode: 49 };

test("version installée plus ancienne : bloqué", () => assert.equal(doitBloquer(latest, { build: "48" }), true));
test("version à jour : pas bloqué", () => assert.equal(doitBloquer(latest, { build: "49" }), false));
test("APK de test plus récent que la version publiée : pas bloqué", () => assert.equal(doitBloquer(latest, { build: "50" }), false));
test("hors connexion (latest inconnu) : jamais bloqué", () => assert.equal(doitBloquer(null, { build: "1" }), false));
test("version installée inconnue : pas bloqué", () => assert.equal(doitBloquer(latest, null), false));
test("téléphone trop ancien pour la nouvelle version : pas bloqué", () =>
  assert.equal(doitBloquer({ ...latest, androidMin: 8 }, { build: "48" }, 7), false));
test("téléphone assez récent : bloqué", () => assert.equal(doitBloquer({ ...latest, androidMin: 8 }, { build: "48" }, 14), true));
test("version d'Android lue dans le navigateur", () => {
  assert.equal(versionAndroid("Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit"), 13);
  assert.equal(versionAndroid("Mozilla/5.0 (Windows NT 10.0)"), null);
});
