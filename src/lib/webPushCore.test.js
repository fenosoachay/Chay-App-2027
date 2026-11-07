import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  BASE44_VAPID_PUBLIC_KEY,
  ensurePushSubscription,
  resolveVapidPublicKey,
  saveSubscriptionRecord,
  subscriptionUsesOtherKey,
  urlBase64ToUint8Array,
} from "./webPushCore.js";

const newPublicKey = () => {
  const e = crypto.createECDH("prime256v1");
  e.generateKeys();
  return e.getPublicKey("base64url");
};
const NEW_KEY = newPublicKey();

// ── Faux navigateur ──────────────────────────────────────────────────────────
let counter = 0;
function fakeSubscription(keyBytes, { exposeKey = true } = {}) {
  counter += 1;
  const sub = {
    endpoint: `https://push.exemple.fr/abonnement-${counter}`,
    options: exposeKey ? { applicationServerKey: keyBytes ? new Uint8Array(keyBytes).buffer : null } : {},
    unsubscribed: false,
    async unsubscribe() { sub.unsubscribed = true; return true; },
    toJSON() { return { endpoint: sub.endpoint, keys: { p256dh: `p256dh-${counter}`, auth: `auth-${counter}` } }; },
  };
  return sub;
}
function fakePushManager(existing) {
  const pm = {
    current: existing || null,
    subscribeCalls: [],
    async getSubscription() { return pm.current; },
    async subscribe(options) {
      pm.subscribeCalls.push(options);
      pm.current = fakeSubscription(options.applicationServerKey);
      return pm.current;
    },
  };
  return pm;
}

// ── Fausse entité WebPushSubscription ────────────────────────────────────────
function fakeEntity(rows = []) {
  const ent = {
    rows: rows.map((r) => ({ ...r })),
    calls: [],
    async filter(q, _sort, limit) { ent.calls.push(["filter", q.endpoint]); return ent.rows.filter((r) => r.endpoint === q.endpoint).slice(0, limit); },
    async update(id, data) { ent.calls.push(["update", id]); Object.assign(ent.rows.find((r) => r.id === id), data); },
    async create(data) { ent.calls.push(["create"]); ent.rows.push({ id: `rec${ent.rows.length + 1}`, ...data }); },
  };
  return ent;
}

test("clé publique : mode base44 = ancienne clé en dur ; mode PocketBase = VITE_VAPID_PUBLIC_KEY", () => {
  assert.equal(resolveVapidPublicKey(false, NEW_KEY), BASE44_VAPID_PUBLIC_KEY);
  assert.equal(resolveVapidPublicKey(false, undefined), BASE44_VAPID_PUBLIC_KEY);
  assert.equal(resolveVapidPublicKey(true, ` ${NEW_KEY} `), NEW_KEY);
  assert.equal(resolveVapidPublicKey(true, undefined), "", "PocketBase sans clé : push navigateur indisponible");
  assert.equal(resolveVapidPublicKey(true, "pas une clé"), "");
  assert.equal(urlBase64ToUint8Array(NEW_KEY).length, 65);
});

test("comparaison de clé : même clé, autre clé, navigateur sans options.applicationServerKey", () => {
  const expected = urlBase64ToUint8Array(NEW_KEY);
  assert.equal(subscriptionUsesOtherKey(fakeSubscription(expected), expected), false);
  assert.equal(subscriptionUsesOtherKey(fakeSubscription(urlBase64ToUint8Array(BASE44_VAPID_PUBLIC_KEY)), expected), true);
  assert.equal(subscriptionUsesOtherKey(fakeSubscription(expected, { exposeKey: false }), expected), false);
});

test("aucun abonnement : création avec la nouvelle clé", async () => {
  const pm = fakePushManager(null);
  const r = await ensurePushSubscription(pm, NEW_KEY);
  assert.equal(pm.subscribeCalls.length, 1);
  assert.deepEqual([...pm.subscribeCalls[0].applicationServerKey], [...urlBase64ToUint8Array(NEW_KEY)]);
  assert.equal(pm.subscribeCalls[0].userVisibleOnly, true);
  assert.equal(r.renewed, false);
  assert.equal(r.previousEndpoint, null);
});

test("abonnement avec la bonne clé : réutilisé tel quel", async () => {
  const sub = fakeSubscription(urlBase64ToUint8Array(NEW_KEY));
  const pm = fakePushManager(sub);
  const r = await ensurePushSubscription(pm, NEW_KEY);
  assert.equal(r.subscription, sub);
  assert.equal(sub.unsubscribed, false);
  assert.equal(pm.subscribeCalls.length, 0);
});

test("abonnement créé avec l'ancienne clé Base44 : désabonné puis recréé avec la nouvelle", async () => {
  const old = fakeSubscription(urlBase64ToUint8Array(BASE44_VAPID_PUBLIC_KEY));
  const pm = fakePushManager(old);
  const r = await ensurePushSubscription(pm, NEW_KEY);
  assert.equal(old.unsubscribed, true);
  assert.equal(pm.subscribeCalls.length, 1);
  assert.notEqual(r.subscription, old);
  assert.equal(r.renewed, true);
  assert.equal(r.previousEndpoint, old.endpoint);
  assert.equal(subscriptionUsesOtherKey(r.subscription, urlBase64ToUint8Array(NEW_KEY)), false);
});

test("mode base44 (resubscribeOnKeyChange = false) : comportement d'origine, jamais de ré-abonnement", async () => {
  const other = fakeSubscription(urlBase64ToUint8Array(NEW_KEY));
  const pm = fakePushManager(other);
  const r = await ensurePushSubscription(pm, BASE44_VAPID_PUBLIC_KEY, { resubscribeOnKeyChange: false });
  assert.equal(r.subscription, other);
  assert.equal(other.unsubscribed, false);
  assert.equal(pm.subscribeCalls.length, 0);
});

test("enregistrement : nouvel appareil -> création", async () => {
  const ent = fakeEntity();
  const sub = fakeSubscription(urlBase64ToUint8Array(NEW_KEY));
  await saveSubscriptionRecord(ent, "u1", sub, { userAgent: "x".repeat(400) });
  assert.equal(ent.rows.length, 1);
  assert.equal(ent.rows[0].endpoint, sub.endpoint);
  assert.equal(ent.rows[0].user_id, "u1");
  assert.equal(ent.rows[0].is_active, true);
  assert.equal(ent.rows[0].user_agent.length, 300);
});

test("enregistrement : même endpoint -> mise à jour, pas de doublon", async () => {
  const sub = fakeSubscription(urlBase64ToUint8Array(NEW_KEY));
  const ent = fakeEntity([{ id: "rec1", endpoint: sub.endpoint, user_id: "u1", is_active: false }]);
  await saveSubscriptionRecord(ent, "u1", sub);
  assert.equal(ent.rows.length, 1);
  assert.equal(ent.rows[0].is_active, true);
  assert.ok(!ent.calls.some(([c]) => c === "create"));
});

test("ré-abonnement : l'ancienne ligne (ancien endpoint) est remplacée, aucune nouvelle ligne", async () => {
  const ent = fakeEntity([
    { id: "rec1", endpoint: "https://push.exemple.fr/ancien", p256dh: "vieux", auth: "vieux", user_id: "u1", is_active: true },
    { id: "rec2", endpoint: "https://push.exemple.fr/autre-appareil", user_id: "u1", is_active: true },
  ]);
  const sub = fakeSubscription(urlBase64ToUint8Array(NEW_KEY));
  await saveSubscriptionRecord(ent, "u1", sub, { previousEndpoint: "https://push.exemple.fr/ancien" });
  assert.equal(ent.rows.length, 2);
  const rec1 = ent.rows.find((r) => r.id === "rec1");
  assert.equal(rec1.endpoint, sub.endpoint);
  assert.equal(rec1.p256dh, sub.toJSON().keys.p256dh);
  assert.equal(rec1.is_active, true);
  assert.equal(ent.rows.find((r) => r.id === "rec2").endpoint, "https://push.exemple.fr/autre-appareil", "autre appareil intact");
  assert.ok(!ent.calls.some(([c]) => c === "create"));
});

test("ré-abonnement : si le nouvel endpoint existe déjà, il est mis à jour et l'ancien désactivé", async () => {
  const sub = fakeSubscription(urlBase64ToUint8Array(NEW_KEY));
  const ent = fakeEntity([
    { id: "rec1", endpoint: "https://push.exemple.fr/ancien", user_id: "u1", is_active: true },
    { id: "rec2", endpoint: sub.endpoint, user_id: "u1", is_active: false },
  ]);
  await saveSubscriptionRecord(ent, "u1", sub, { previousEndpoint: "https://push.exemple.fr/ancien" });
  assert.equal(ent.rows.find((r) => r.id === "rec2").is_active, true);
  assert.equal(ent.rows.find((r) => r.id === "rec1").is_active, false);
  assert.ok(!ent.calls.some(([c]) => c === "create"));
});

test("parcours complet : ancien abonnement Base44 -> nouvel abonnement enregistré à la place de l'ancien", async () => {
  const old = fakeSubscription(urlBase64ToUint8Array(BASE44_VAPID_PUBLIC_KEY));
  const ent = fakeEntity([{ id: "rec1", endpoint: old.endpoint, user_id: "u1", is_active: true }]);
  const pm = fakePushManager(old);
  const { subscription, previousEndpoint } = await ensurePushSubscription(pm, NEW_KEY);
  await saveSubscriptionRecord(ent, "u1", subscription, { previousEndpoint });
  assert.equal(ent.rows.length, 1);
  assert.equal(ent.rows[0].endpoint, subscription.endpoint);
  assert.notEqual(ent.rows[0].endpoint, old.endpoint);
  // Deuxième ouverture de l'app : plus rien à faire.
  const again = await ensurePushSubscription(pm, NEW_KEY);
  assert.equal(again.renewed, false);
  assert.equal(pm.subscribeCalls.length, 1);
});
