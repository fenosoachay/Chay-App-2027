import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chargerLib } from "../../pocketbase/tests/charger-cjs.mjs";
import { formatHeure, heureReunion, upcomingEvents } from "./upcomingEvents.js";
import { planAnnonces, REGLE_LECTURE_ANNONCES } from "../../pocketbase/scripts/migrer-lot-d.mjs";

const { instantReunion, aArchiver } = chargerLib("reunions.js");
const { offsetMinutes } = chargerLib("fuseaux.js");
const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("serveur : heure de la réunion à Paris (hiver UTC+1, été UTC+2), sans heure = fin de journée", () => {
  assert.equal(new Date(instantReunion({ event_date: "2026-11-20 00:00:00.000Z", event_time: "18:30" }, offsetMinutes)).toISOString(), "2026-11-20T17:30:00.000Z");
  assert.equal(new Date(instantReunion({ event_date: "2026-07-05", event_time: "10:00" }, offsetMinutes)).toISOString(), "2026-07-05T08:00:00.000Z");
  assert.equal(new Date(instantReunion({ date: "2026-11-20" }, offsetMinutes)).toISOString(), "2026-11-20T22:59:00.000Z");
  assert.equal(instantReunion({ date: "" }, offsetMinutes), null);
  const evt = { type: "event", event_date: "2026-11-20", event_time: "18:30" };
  assert.equal(aArchiver(evt, Date.parse("2026-11-20T17:29:00Z"), offsetMinutes), false);
  assert.equal(aArchiver(evt, Date.parse("2026-11-20T17:30:00Z"), offsetMinutes), true);
  assert.equal(aArchiver({ ...evt, archived: true }, Date.parse("2027-01-01T00:00:00Z"), offsetMinutes), false);
  assert.equal(aArchiver({ ...evt, type: "news" }, Date.parse("2027-01-01T00:00:00Z"), offsetMinutes), false);
});

test("app : réunion archivée ou heure passée aujourd'hui = masquée ; heure affichée", () => {
  const ev = (id, extra) => ({ id, date: "2026-11-13", event_date: "2026-11-13", type: "event", ...extra });
  const now = new Date(2026, 10, 13, 18, 0);
  const r = upcomingEvents([ev("matin", { event_time: "09:00" }), ev("soir", { event_time: "19:30" }), ev("arch", { archived: true }), ev("ancienne", {})], "2026-11-13", now);
  assert.deepEqual(r.map((e) => e.id), ["soir", "ancienne"]);
  assert.equal(heureReunion({ event_time: "19:30" }), "19:30");
  assert.equal(heureReunion({ event_time: "7h" }), "");
  assert.equal(formatHeure("19:30"), "19 h 30");
});

test("admin : heure saisie à la création, affichée, « Archivées » dans le panneau ; tâche serveur toutes les 5 min", () => {
  const s = lire("src/components/home/ProchaineReunionSection.jsx");
  assert.match(s, /if \(!draft\.id && !HEURE_RE\.test\(draft\.event_time \|\| ""\)\)/);
  assert.match(s, /id="pr-event-time"\s+type="time"/);
  assert.match(s, /à \{formatHeure\(heureReunion\(event\)\)\}/);
  assert.match(lire("src/components/admin/EntityCrud.jsx"), /entity === "Announcement" && !editing && rest\.type === "event" && !HEURE_RE\.test/);
  assert.match(lire("src/components/admin/AdminContent.jsx"), /section\.key === "Announcement" && <ReunionsArchivees/);
  assert.match(lire("src/components/admin/ReunionsArchivees.jsx"), /filter\(\{ type: "event", archived: true \}/);
  assert.match(lire("pocketbase/pb_hooks/reunions.pb.js"), /cronAdd\('reunions_archivage', '\*\/5 \* \* \* \*'/);
});

test("schéma : event_time HH:MM + archived ; lecture des archivées réservée aux admins (idempotent)", () => {
  const col = { listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""', fields: [{ id: "a", name: "title", type: "text" }] };
  const p = planAnnonces(col);
  assert.equal(p.corps.listRule, REGLE_LECTURE_ANNONCES);
  assert.match(p.corps.fields.find((f) => f.name === "event_time").pattern, /\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$/);
  assert.equal(p.corps.fields.find((f) => f.name === "archived").type, "bool");
  assert.equal(planAnnonces({ ...col, ...p.corps }), null);
  assert.equal(col.fields.length, 1);
});
