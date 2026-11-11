import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DELAIS_NOUVEL_ESSAI_MS, decisionApresEchec, decisionHorsLigne, doitVerifierAuRetour, estRevocation, etatInitial,
} from "./sessionPolicy.js";

const profil = { id: "u1", email: "x" };
const reseau = Object.assign(new Error("injoignable"), { status: 0, code: "network_error" });
const delai = new Error("Délai réseau dépassé"); // pas de status
const trop = Object.assign(new Error("Too Many Requests"), { status: 429 });
const panne = Object.assign(new Error("Service Unavailable"), { status: 503 });
const expiree = Object.assign(new Error("Authentification requise"), { status: 403, code: "auth_required", data: { extra_data: { reason: "auth_required" } } });

test("hors ligne au lancement : session gardée (app complète) si un profil est mémorisé", () => {
  assert.deepEqual(etatInitial({ jeton: "t", enLigne: false, profil }), { verifier: false, connecte: true, modeLocal: false, chargement: false });
  assert.equal(etatInitial({ jeton: "t", enLigne: false, profil: null }).modeLocal, true); // rien pour continuer
  assert.equal(etatInitial({ jeton: null, enLigne: true, profil: null }).modeLocal, true); // invité
  assert.deepEqual(etatInitial({ jeton: "t", enLigne: true, profil }), { verifier: true, connecte: false, modeLocal: false, chargement: true });
});

test("coupure puis retour : session gardée pendant la coupure, vérifiée au retour (au plus 1 fois / min)", () => {
  assert.equal(decisionHorsLigne({ jeton: "t", profil }), "garder");
  assert.equal(decisionHorsLigne({ jeton: null, profil }), "invite");
  const t0 = 1_000_000;
  assert.equal(doitVerifierAuRetour(t0, t0 + 30_000), false);
  assert.equal(doitVerifierAuRetour(t0, t0 + 60_000), true);
  assert.equal(doitVerifierAuRetour(0, t0), true);
});

test("429, 5xx, réseau, délai dépassé : JAMAIS de déconnexion, nouvel essai progressif", () => {
  for (const erreur of [trop, panne, reseau, delai, Object.assign(new Error("x"), { status: 500 }), Object.assign(new Error("x"), { status: 400 })]) {
    assert.equal(estRevocation(erreur), false, erreur.message);
    assert.equal(decisionApresEchec({ erreur, jeton: "t", profil, essai: 0 }).action, "garder", erreur.message);
  }
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((essai) => decisionApresEchec({ erreur: trop, jeton: "t", profil, essai }).reessayerDans),
    [...DELAIS_NOUVEL_ESSAI_MS, DELAIS_NOUVEL_ESSAI_MS.at(-1)]);
  assert.equal(decisionApresEchec({ erreur: trop, jeton: "t", profil: null }).action, "invite"); // aucun profil pour continuer
});

test("session expirée réelle (401 / 403 / 404 de authRefresh, auth_required) : déconnexion", () => {
  for (const erreur of [expiree, Object.assign(new Error("x"), { status: 401 }), Object.assign(new Error("x"), { status: 404 })]) {
    assert.equal(estRevocation(erreur), true);
    assert.deepEqual(decisionApresEchec({ erreur, jeton: "t", profil }), { action: "deconnecter", reessayerDans: null });
  }
});

test("AuthContext : coupure -> session gardée ; retour réseau et retour dans l'app -> vérification ; bandeau hors ligne", () => {
  const code = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const auth = code("./AuthContext.jsx");
  assert.match(auth, /addEventListener\('offline', onOffline\)/);
  assert.match(auth, /addEventListener\('online', onOnline\)/);
  assert.match(auth, /CapacitorApp\.addListener\('appStateChange'/);
  assert.doesNotMatch(auth, /addEventListener\('offline', enterLocalMode\)/);
  assert.match(auth, /decisionApresEchec\(/);
  assert.match(code("../components/Layout.jsx"), /<OfflineBanner \/>/);
});
