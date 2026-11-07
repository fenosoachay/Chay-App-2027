import test from "node:test";
import assert from "node:assert/strict";
import { cropGeometry, renderCropToBlob } from "./imageCrop.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

test("carré sans zoom sur une photo 1600x1200 : carré central de 1200 px", () => {
  const { source } = cropGeometry({ natural: { w: 1600, h: 1200 }, vpW: 280, vpH: 280, zoom: 1, offset: { x: 0, y: 0 } });
  near(source.sx, 200); near(source.sy, 0); near(source.sW, 1200); near(source.sH, 1200);
});

test("zoom x2 : zone deux fois plus petite ; déplacement borné à l'image", () => {
  const z = cropGeometry({ natural: { w: 1600, h: 1200 }, vpW: 280, vpH: 280, zoom: 2 }).source;
  near(z.sW, 600); near(z.sH, 600); near(z.sx, 500); near(z.sy, 300);
  const loin = cropGeometry({ natural: { w: 1600, h: 1200 }, vpW: 280, vpH: 280, zoom: 2, offset: { x: 1e6, y: -1e6 } }).source;
  near(loin.sx, 0); near(loin.sy, 600);
});

test("couverture 2,5:1 : zone aux mêmes proportions", () => {
  const { source } = cropGeometry({ natural: { w: 1600, h: 1200 }, vpW: 280, vpH: 112, zoom: 1 });
  near(source.sW / source.sH, 2.5);
});

test("image pas encore chargée : aucune zone, et le rendu refuse", async () => {
  assert.equal(cropGeometry({ natural: { w: 0, h: 0 }, vpW: 280, vpH: 280 }).source, null);
  await assert.rejects(renderCropToBlob({}, null, 1, { doc: {} }), /zone vide/);
});

test("rendu : canvas de 640 px de large, JPEG, c'est bien un Blob qui est rendu", async () => {
  const appels = [];
  const canvas = {
    getContext: () => ({ fillRect() {}, drawImage: (...a) => appels.push(a), fillStyle: "" }),
    toBlob: (cb, type) => cb(new Blob([new Uint8Array(300 * 1024)], { type })),
  };
  const blob = await renderCropToBlob("img", { sx: 1, sy: 2, sW: 3, sH: 4 }, 2.5, { doc: { createElement: () => canvas } });
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 256);
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, "image/jpeg");
  assert.equal(blob.size, 300 * 1024);
  assert.deepEqual(appels[0], ["img", 1, 2, 3, 4, 0, 0, 640, 256]);
});
