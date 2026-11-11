import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DELAIS_REPRISE_MS, estAbsenceReelle, reprendreConversation } from "./conversationReprise.js";

const err = (status) => Object.assign(new Error(`statut ${status}`), { status });
const sansAttente = async () => {};
const conv = { id: "c1", participant_ids: ["moi", "autre"] };
const lecteur = (...reponses) => {
  const appels = [];
  const lire = async (id) => {
    appels.push(id);
    const r = reponses[Math.min(appels.length - 1, reponses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { lire, appels };
};

test("conversation lisible : ok du premier coup", async () => {
  const { lire, appels } = lecteur(conv);
  assert.deepEqual(await reprendreConversation({ id: "c1", lire, attendre: sansAttente }), { etat: "ok", conversation: conv });
  assert.deepEqual(appels, ["c1"]);
});

test("vraiment introuvable (404 / 403 / pas participant) : aucun nouvel essai", async () => {
  for (const r of [err(404), err(403)]) {
    const { lire, appels } = lecteur(r);
    assert.deepEqual(await reprendreConversation({ id: "c1", lire, attendre: sansAttente }), { etat: "introuvable" });
    assert.equal(appels.length, 1);
  }
  const { lire } = lecteur(conv);
  assert.deepEqual(await reprendreConversation({ id: "c1", lire, attendre: sansAttente, estAMoi: () => false }), { etat: "introuvable" });
});

test("429 / réseau puis succès : nouvel essai, conversation ouverte", async () => {
  const attentes = [];
  const { lire, appels } = lecteur(err(429), err(0), conv);
  const r = await reprendreConversation({ id: "c1", lire, attendre: async (ms) => { attentes.push(ms); } });
  assert.equal(r.etat, "ok");
  assert.equal(appels.length, 3);
  assert.deepEqual(attentes, DELAIS_REPRISE_MS.filter(Boolean));
});

test("échecs temporaires répétés (réseau, 5xx, délai) : « erreur » (Réessayer), jamais « introuvable »", async () => {
  for (const e of [err(0), err(500), err(503), err(429), new Error("Délai réseau dépassé")]) {
    const { lire, appels } = lecteur(e);
    const r = await reprendreConversation({ id: "c1", lire, attendre: sansAttente });
    assert.equal(r.etat, "erreur", e.message);
    assert.equal(r.erreur, e);
    assert.equal(appels.length, DELAIS_REPRISE_MS.length);
    assert.equal(estAbsenceReelle(e), false);
  }
});

test("page quittée pendant la reprise : annulé, pas de mise à jour", async () => {
  let annule = false;
  const lire = async () => { annule = true; return conv; };
  assert.deepEqual(await reprendreConversation({ id: "c1", lire, attendre: sansAttente, annule: () => annule }), { etat: "annule" });
});

test("Messages.jsx : Chargement…, Impossible de charger + Réessayer, introuvable distinct ; liste gardée sur erreur", () => {
  const src = fs.readFileSync(new URL("../pages/Messages.jsx", import.meta.url), "utf8");
  assert.match(src, /reprendreConversation\(/);
  assert.match(src, /base44\.entities\.Conversation\.get\(id\)/);
  assert.match(src, /Chargement…/);
  assert.match(src, /Impossible de charger la conversation\./);
  assert.match(src, /Réessayer/);
  assert.match(src, /etatReprise === "introuvable"/);
  assert.doesNotMatch(src, /Conversation\.list\("-updated_date", 100\)\.catch\(\(\) => \[\]\)/);
});
