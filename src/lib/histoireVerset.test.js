import assert from "node:assert/strict";
import test from "node:test";
import { dejaVue, finDuTexte, histoireDe, libelleFin, MESSAGE_SANS_HISTOIRE } from "./histoireVerset.js";

test("petite histoire : type et contenu", () => {
  assert.equal(histoireDe(null), null);
  assert.equal(histoireDe({ histoire_type: "" }), null);
  assert.equal(histoireDe({ histoire_type: "video", histoire_url: "" }), null);
  assert.deepEqual(histoireDe({ histoire_type: "audio", histoire_url: " https://a/b.mp3 ", histoire_titre: "T" }), { type: "audio", titre: "T", url: "https://a/b.mp3" });
  assert.deepEqual(histoireDe({ histoire_type: "texte", histoire_texte: "Il était une fois" }), { type: "texte", titre: "", texte: "Il était une fois" });
  assert.equal(MESSAGE_SANS_HISTOIRE, "Une petite histoire vous attend la prochaine fois.");
});

test("petite histoire : bouton de fin", () => {
  assert.equal(libelleFin("video"), "Vu");
  assert.equal(libelleFin("audio"), "Entendu");
  assert.equal(libelleFin("texte"), "Lu");
  assert.equal(libelleFin(null), "OK");
  assert.equal(finDuTexte({ scrollTop: 492, clientHeight: 300, scrollHeight: 800 }), true);
  assert.equal(finDuTexte({ scrollTop: 0, clientHeight: 300, scrollHeight: 800 }), false);
  assert.equal(finDuTexte({ scrollTop: 0, clientHeight: 300, scrollHeight: 300 }), true);
});

test("petite histoire : déjà vue (serveur)", () => {
  assert.equal(dejaVue("d1", { histoires_vues: ["d1"] }), true);
  assert.equal(dejaVue("d2", { histoires_vues: ["d1"] }), false);
  assert.equal(dejaVue("", {}), true);
});
