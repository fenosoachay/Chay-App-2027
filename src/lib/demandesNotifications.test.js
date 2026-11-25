import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { routeCible } from "./routesNotification.js";

const lire = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("1.3.34 : requêtes, dons et formulaire -> notifications des concernés", () => {
  const h = lire("../../pocketbase/pb_hooks/demandes.pb.js");
  for (const c of ["PrayerRequest", "MissionRequest", "DonationRequest", "ContactMessage"]) assert.match(h, new RegExp(`'${c}'`));
  assert.match(h, /getString\('source'\) !== 'site'/);
  const n = lire("../../pocketbase/pb_hooks/lib/notifications.js");
  assert.match(n, /priere: \{ type: 'priere_nouvelle'/);
  assert.match(n, /disabled != true && systeme != true', '', 0, 0\)\s+: \$app\.findRecordsByFilter\('users', "role = 'admin'/);
  assert.equal(routeCible("priere_nouvelle"), "/requests?tab=prayer");
  assert.equal(routeCible("mission_request"), "/admin/missions");
  assert.equal(routeCible("donation_request"), "/admin/donations");
});
