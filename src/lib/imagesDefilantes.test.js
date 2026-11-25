import test from "node:test";
import assert from "node:assert/strict";
import { FORMATS, dureeGroupe, groupesPour, ratioDe, tailleDansCase } from "./imagesDefilantes.js";
import { COLLECTION_IMAGES } from "../../pocketbase/scripts/migrer-1-3-34.mjs";

const musique = { id: "t1", mediaType: "music", playlist_id: "p1" };
const G = (o) => ({ id: o.id || "g", format: "paysage", animation: "horizontal", ou: "partout", images: ["https://x/a.jpg", "https://x/b.jpg"], ...o });

test("1.3.34 : image qui défile : groupes par format, mêmes règles que le texte", () => {
  const g = groupesPour([G({ id: "a", order: 2 }), G({ id: "b", order: 1, format: "carre", animation: "?" }), G({ id: "c", ou: "predication" }), G({ id: "d", images: [] }), G({ id: "e", playlist_id: "autre" })], musique);
  assert.deepEqual(g.map((x) => x.id), ["b", "a"]);
  assert.equal(g[0].animation, "fondu");
  assert.equal(g[1].ratio, 16 / 9);
  assert.deepEqual(groupesPour([G({})], { mediaType: "radio" }), []);
  assert.equal(FORMATS.length, 4);
  assert.equal(ratioDe("vertical"), 9 / 16);
  assert.deepEqual(tailleDansCase(16 / 9, 320), { w: 320, h: 180 });
  assert.deepEqual(tailleDansCase(9 / 16, 320), { w: 180, h: 320 });
  assert.equal(dureeGroupe({ images: [1, 2, 3], secondes: 4 }), 12);
  assert.equal(COLLECTION_IMAGES.name, "ImageDefilante");
  assert.ok(COLLECTION_IMAGES.fields.some((f) => f.name === "images" && f.type === "json"));
});
