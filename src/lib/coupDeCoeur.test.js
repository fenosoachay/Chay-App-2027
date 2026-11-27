import test from "node:test";
import assert from "node:assert/strict";
import { choisirCoupDeCoeur, estAffiche, etatAdmin, finAffichage, minutes, onde, pisteDe, titreDuMois } from "./coupDeCoeur.js";

const MAINTENANT = Date.parse("2026-11-27T12:00:00Z");
const base = { id: "c1", actif: true, audio_url: "https://x/son.mp3", title: "Tsy misy toa Anao", debut: "2026-11-25 12:00:00.000Z" };

test("affiché pendant la durée choisie, puis plus", () => {
  assert.equal(estAffiche({ ...base, duree_jours: 3 }, MAINTENANT), true);
  assert.equal(estAffiche({ ...base, duree_jours: 2 }, MAINTENANT), false);
  assert.equal(estAffiche({ ...base, duree_jours: 0 }, MAINTENANT), true, "toujours");
});

test("retiré à la main, sans audio ou programmé plus tard : pas affiché", () => {
  assert.equal(estAffiche({ ...base, actif: false }, MAINTENANT), false);
  assert.equal(estAffiche({ ...base, audio_url: "" }, MAINTENANT), false);
  assert.equal(estAffiche({ ...base, debut: "2026-12-01 00:00:00.000Z" }, MAINTENANT), false);
});

test("le plus récent affiché est choisi", () => {
  const a = { ...base, id: "a", debut: "2026-11-01 00:00:00.000Z" };
  const b = { ...base, id: "b", debut: "2026-11-20 00:00:00.000Z" };
  const fini = { ...base, id: "c", debut: "2026-11-26 00:00:00.000Z", duree_jours: 1 };
  assert.equal(choisirCoupDeCoeur([a, b, fini], MAINTENANT).id, "b");
  assert.equal(choisirCoupDeCoeur([], MAINTENANT), null);
});

test("fin d'affichage et état admin", () => {
  assert.equal(finAffichage({ ...base, duree_jours: 0 }), null);
  assert.equal(finAffichage({ ...base, duree_jours: 1 }), Date.parse("2026-11-26T12:00:00Z"));
  assert.equal(etatAdmin({ ...base, actif: false }, MAINTENANT).cle, "retire");
  assert.equal(etatAdmin({ ...base, duree_jours: 1 }, MAINTENANT).cle, "termine");
  assert.equal(etatAdmin({ ...base, duree_jours: 0 }, MAINTENANT).texte, "Affiché · toujours");
  assert.match(etatAdmin({ ...base, duree_jours: 7 }, MAINTENANT).texte, /^Affiché jusqu'au 2 décembre/);
});

test("titre du mois : « de » ou « d' »", () => {
  assert.equal(titreDuMois(new Date(2026, 10, 27)), "Coup de cœur de novembre");
  assert.equal(titreDuMois(new Date(2026, 3, 2)), "Coup de cœur d'avril");
  assert.equal(titreDuMois(new Date(2026, 7, 2)), "Coup de cœur d'août");
});

test("onde stable et bornée, minutes lisibles", () => {
  const o = onde("c1");
  assert.equal(o.length, 46);
  assert.deepEqual(o, onde("c1"));
  assert.ok(o.every((v) => v >= 0.18 && v <= 1));
  assert.equal(minutes(65), "1:05");
  assert.equal(minutes(750), "12:30");
});

test("piste : la musique liée garde son identifiant et compte ses écoutes", () => {
  const p = pisteDe({ ...base, track_id: "m9" });
  assert.equal(p.id, "m9");
  assert.deepEqual(p.vue, { type: "piste", id: "m9" });
  assert.equal(p.discret, true);
  const q = pisteDe(base);
  assert.equal(q.id, "coup-de-coeur-c1");
  assert.equal(q.vue, undefined);
});
