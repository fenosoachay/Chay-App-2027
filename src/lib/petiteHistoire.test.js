import test from "node:test";
import assert from "node:assert/strict";
import { cleVue, histoireAMontrer, histoireValide, noterVueLocale, videoLisiblePartout } from "./petiteHistoire.js";

const stockage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test("histoire valide : vidéo/photo avec fichier, texte avec texte, en ligne", () => {
  assert.equal(histoireValide({ actif: true, type: "video", media_url: "https://r2/x.mp4" }), true);
  assert.equal(histoireValide({ actif: true, type: "photo", media_url: "javascript:alert(1)" }), false);
  assert.equal(histoireValide({ actif: true, type: "texte", texte: "  " }), false);
  assert.equal(histoireValide({ actif: false, type: "texte", texte: "Il était une fois" }), false);
});

test("la plus récente non vue ; Ok -> elle ne revient plus", () => {
  const st = stockage();
  const h = [
    { id: "a", actif: true, type: "texte", texte: "A", created: "2026-11-20 10:00:00.000Z" },
    { id: "b", actif: true, type: "photo", media_url: "https://x/b.jpg", created: "2026-11-23 10:00:00.000Z" },
  ];
  assert.equal(histoireAMontrer(h, { histoires_vues: [] }, st).id, "b");
  assert.equal(histoireAMontrer(h, { histoires_vues: [cleVue("b")] }, st).id, "a");
  noterVueLocale("a", st);
  assert.equal(histoireAMontrer(h, { histoires_vues: [cleVue("b")] }, st), null);
  assert.equal(histoireAMontrer(null, null, st), null);
});

test("formats vidéo lisibles partout", () => {
  assert.equal(videoLisiblePartout("https://r2/v.mp4"), true);
  assert.equal(videoLisiblePartout("https://r2/v.MOV?x=1"), true);
  assert.equal(videoLisiblePartout("https://r2/v.avi"), false);
  assert.equal(videoLisiblePartout("https://r2/v.wmv"), false);
});
