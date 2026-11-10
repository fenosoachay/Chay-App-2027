import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { APK_URL, LATEST_URL, compareInstalled, describeLatest, fetchLatest, parseLatest } from "./apkRelease.js";

// Garde-fou : aucun test de ce fichier ne doit toucher le réseau (la prod est sur membres.chay.fr).
globalThis.fetch = async (url) => { throw new Error(`Réseau interdit dans les tests : ${url}`); };

const ok = { versionName: "1.3", versionCode: 4, date: "2026-11-10T18:00:00.000Z", tailleMo: 25.4 };
const reponse = (status, body, { jsonError = false } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => { if (jsonError) throw new SyntaxError("JSON invalide"); return body; },
});

test("adresses stables sur membres.chay.fr, aucune adresse GitHub", () => {
  assert.equal(APK_URL, "https://membres.chay.fr/telechargements/chay.apk");
  assert.equal(LATEST_URL, "https://membres.chay.fr/telechargements/latest.json");
  assert.doesNotMatch(APK_URL + LATEST_URL, /github/i);
});

test("parseLatest : contenu valide", () => {
  assert.deepEqual(parseLatest(ok), ok);
  assert.deepEqual(parseLatest({ versionName: " 1.3 ", versionCode: "4" }), { versionName: "1.3", versionCode: 4, date: null, tailleMo: null });
});

test("parseLatest : contenus invalides -> null (ou champ facultatif ignoré)", () => {
  for (const bad of [null, [], "x", {}, { versionName: "1.3" }, { versionCode: 4 }, { versionName: "1.3<script>", versionCode: 4 }, { versionName: "1.3", versionCode: 0 }, { versionName: "1.3", versionCode: 4.5 }]) {
    assert.equal(parseLatest(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseLatest({ ...ok, date: "pas une date" }).date, null);
  assert.equal(parseLatest({ ...ok, tailleMo: -3 }).tailleMo, null);
});

test("fetchLatest : succès, sans cache", async () => {
  let init = null;
  const r = await fetchLatest({ fetchImpl: async (url, i) => { init = { url, ...i }; return reponse(200, ok); } });
  assert.deepEqual(r, ok);
  assert.equal(init.url, LATEST_URL);
  assert.equal(init.cache, "no-store");
});

test("fetchLatest : ne lève jamais d'erreur (404, réseau, JSON invalide, contenu invalide, délai)", async () => {
  assert.equal(await fetchLatest({ fetchImpl: async () => reponse(404, null) }), null);
  assert.equal(await fetchLatest({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }), null);
  assert.equal(await fetchLatest({ fetchImpl: async () => reponse(200, null, { jsonError: true }) }), null);
  assert.equal(await fetchLatest({ fetchImpl: async () => reponse(200, { versionName: "x" }) }), null);
  // fetchImpl null (et non undefined, qui donnerait le VRAI fetch vers membres.chay.fr) : aucune requête.
  assert.equal(await fetchLatest({ fetchImpl: null }), null);
  const lent = (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("abort"))));
  const t0 = Date.now();
  assert.equal(await fetchLatest({ fetchImpl: lent, timeoutMs: 50 }), null);
  assert.ok(Date.now() - t0 < 2000);
});

test("describeLatest : version, date, taille ; parties absentes omises", () => {
  assert.equal(describeLatest(ok), "Version 1.3 · 10 nov. 2026 · 25,4 Mo");
  assert.equal(describeLatest({ versionName: "1.3", versionCode: 4, date: null, tailleMo: null }), "Version 1.3");
  assert.equal(describeLatest(null), null);
});

test("compareInstalled : à jour, nouvelle version, navigateur, version inconnue", () => {
  assert.equal(compareInstalled(ok, { version: "1.3", build: "4" }).etat, "a-jour");
  assert.equal(compareInstalled(ok, { version: "1.4", build: "5" }).etat, "a-jour");
  const n = compareInstalled(ok, { version: "1.2", build: "3" });
  assert.equal(n.etat, "nouvelle");
  assert.match(n.message, /1\.3 \(vous avez la 1\.2\)/);
  assert.equal(compareInstalled(ok, null).etat, "disponible");
  assert.equal(compareInstalled(ok, { version: "?", build: "abc" }).etat, "disponible");
  assert.deepEqual(compareInstalled(null, { build: "3" }), { etat: "inconnue", message: null });
});

test("AboutDialog : bouton vers l'adresse stable, toujours affiché, plus de lien GitHub ni d'URL saisie", () => {
  const src = fs.readFileSync(new URL("../components/home/AboutDialog.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /github/i);
  assert.doesNotMatch(src, /app_apk_url|latestApkUrl/);
  assert.match(src, /href=\{APK_URL\}/);
  // Le bouton n'est pas conditionné par la lecture de latest.json.
  assert.doesNotMatch(src, /\{latest\s*&&\s*\(\s*<ExternalLink/);
});
