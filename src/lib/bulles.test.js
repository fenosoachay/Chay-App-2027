import test from "node:test";
import assert from "node:assert/strict";
import { bougerBulles, creerBulles } from "./bulles.js";

const L = 360;
const H = 360;

test("bulles : réparties dans la boîte, sans chevauchement au départ", () => {
  const b = creerBulles(6, L, H, 42);
  assert.equal(b.length, 6);
  for (const x of b) {
    assert.ok(x.x >= 42 && x.x <= L - 42 && x.y >= 42 && x.y <= H - 42);
  }
});

test("bulles : ne s'arrêtent jamais, restent dans la boîte, ne se chevauchent pas longtemps", () => {
  let b = creerBulles(6, L, H, 42);
  let t = 0;
  let repere = b;
  for (let k = 0; k < 3000; k++) {
    t += 16.67;
    b = bougerBulles(b, { t, dt: 1, largeur: L, hauteur: H, tilt: { x: 0, y: 0 } });
    if (k % 120 === 119) {
      // En 2 secondes, chaque bulle a bougé.
      b.forEach((x, i) => assert.ok(Math.hypot(x.x - repere[i].x, x.y - repere[i].y) > 3, "une bulle s'est arrêtée"));
      repere = b;
    }
  }
  for (const x of b) assert.ok(x.x >= 42 - 0.01 && x.x <= L - 42 + 0.01 && x.y >= 42 - 0.01 && x.y <= H - 42 + 0.01);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    assert.ok(Math.hypot(b[i].x - b[j].x, b[i].y - b[j].y) > 84 * 0.85);
  }
});

test("bulles : glissent du côté où l'on penche le téléphone", () => {
  let b = creerBulles(3, 600, H, 42);
  const x0 = b.reduce((s, x) => s + x.x, 0);
  let t = 0;
  for (let k = 0; k < 240; k++) { t += 16.67; b = bougerBulles(b, { t, dt: 1, largeur: 600, hauteur: H, tilt: { x: 1, y: 0 } }); }
  assert.ok(b.reduce((s, x) => s + x.x, 0) > x0 + 100);
});
