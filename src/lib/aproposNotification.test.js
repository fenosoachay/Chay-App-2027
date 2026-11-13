import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { routeCible, routeNotification } from "./routesNotification.js";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("notification « Nouvelle version » : route /?apropos=1 (push avec ou sans route, file de reprise)", async () => {
  assert.equal(routeCible("app_update", "13"), "/?apropos=1");
  assert.equal(await routeNotification({ target_type: "app_update", target_id: "13", route: "/?apropos=1" }), "/?apropos=1");
  assert.equal(await routeNotification({ target_type: "app_update", target_id: "13" }), "/?apropos=1");
});

test("« À propos » ouvert par Layout, hors des pages remontées par AnimatedOutlet (clé pathname + search)", () => {
  assert.match(lire("src/components/AnimatedOutlet.jsx"), /key=\{location\.pathname \+ location\.search\}/);
  const layout = lire("src/components/Layout.jsx");
  assert.match(layout, /<AnimatedOutlet \/>\s*\{\/\*[^]*?\*\/\}\s*<AProposDepuisNotification \/>/);
  const host = lire("src/components/home/AProposDepuisNotification.jsx");
  assert.match(host, /searchParams\.has\(PARAM_APROPOS\)/);
  assert.match(host, /<AboutDialog open=\{ouvert\} onOpenChange=\{setOuvert\} \/>/);
  assert.doesNotMatch(lire("src/components/home/QuickAccess.jsx"), /searchParams\.has\("apropos"\)/);
});
