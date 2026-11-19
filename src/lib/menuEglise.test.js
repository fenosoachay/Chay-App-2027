import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ENTREES_MENU_EGLISE, initiales, photosHistoire, trierPersonnel } from "./menuEglise.js";
import { nouvellesCollections } from "../../pocketbase/scripts/migrer-lot-d.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("menu ☰ : Histoire de l'Église, Vision, But, Confession, Personnel", () => {
  assert.deepEqual(ENTREES_MENU_EGLISE.map((e) => [e.label, e.to]), [
    ["Histoire de l'Église", "/eglise/histoire"],
    ["Vision de l'Église", "/eglise/vision"],
    ["But de l'Église", "/eglise/but"],
    ["Confession de foi", "/eglise/confession"],
    ["En service", "/eglise/personnel"],
  ]);
  assert.ok(ENTREES_MENU_EGLISE.every((e) => e.icon && typeof e.icon === "function"));
  const layout = lire("src/components/Layout.jsx");
  assert.equal((layout.match(/<MenuEglise/g) || []).length, 2); // en-tête mobile et ordinateur
  const app = lire("src/App.jsx");
  assert.match(app, /<Route path="\/eglise\/histoire" element=\{<HistoireEglise \/>\} \/>/);
  assert.match(app, /<Route path="\/eglise\/personnel" element=\{<StaffView \/>\} \/>/);
  assert.match(app, /<Route path="\/eglise\/vision" element=\{<PageTexteView/);
  assert.match(app, /<Route path="\/eglise\/but" element=\{<PageTexteView/);
  assert.match(app, /<Route path="\/eglise\/confession" element=\{<PageTexteView/);
});

test("personnel dans l'ordre de l'admin ; photos de l'histoire (http seulement) ; initiales", () => {
  assert.deepEqual(trierPersonnel([{ name: "B", order: 2 }, { name: "A", order: 1 }, { name: "Z" }, { name: "" }]).map((p) => p.name), ["A", "B", "Z"]);
  assert.deepEqual(photosHistoire({ photos: ["https://x/1.jpg", "javascript:alert(1)", 3] }), ["https://x/1.jpg"]);
  assert.deepEqual(photosHistoire(null), []);
  assert.equal(initiales("Jean Rakoto"), "JR");
  assert.match(lire("src/pages/HistoireEglise.jsx"), /DOMPurify\.sanitize\(fiche\.body \|\| ""\)/);
});

test("admin : sections Histoire (texte riche + photos) et Personnel (ordre glissé) ; schéma des deux collections", () => {
  const s = lire("src/components/admin/adminSections.js");
  assert.match(s, /key: "ChurchHistory"[\s\S]*?\{ name: "photos", label: "Photos", type: "images" \}/);
  assert.match(s, /key: "StaffMember"[\s\S]*?sort: "order"/);
  const nav = lire("src/components/admin/nav/adminNavConfig.js");
  assert.match(nav, /key: "ChurchHistory"/);
  assert.match(nav, /key: "StaffMember"/);
  assert.match(lire("src/components/admin/FieldInput.jsx"), /case "images":/);
  const [h, p] = nouvellesCollections();
  assert.equal(h.name, "ChurchHistory");
  assert.deepEqual(h.fields.slice(0, 3).map((f) => [f.name, f.type]), [["title", "text"], ["body", "text"], ["photos", "json"]]);
  assert.deepEqual(p.fields.slice(0, 4).map((f) => f.name), ["name", "role", "photo_url", "order"]);
  for (const c of [h, p]) {
    assert.equal(c.listRule, '@request.auth.id != ""');
    assert.equal(c.createRule, '@request.auth.role = "admin"');
    assert.equal(c.updateRule, '@request.auth.role = "admin"');
  }
  const frag = JSON.parse(lire("pocketbase/config/collections-lot-d.json"));
  assert.deepEqual(frag.map((c) => c.name), ["ChurchHistory", "StaffMember"]);
});
