import test from "node:test";
import assert from "node:assert/strict";
import { deactivateDeviceToken, upsertDeviceToken } from "./deviceTokenSync.js";

/** Faux DeviceToken qui applique les RÈGLES PocketBase (lecture et mise à jour de ses lignes, user_id interdit). */
function fauxDeviceToken(moi, lignes = []) {
  const err404 = () => Object.assign(new Error("The requested resource wasn't found."), { status: 404 });
  const appels = [];
  const DeviceToken = {
    lignes,
    appels,
    async filter(q) { appels.push(["filter", q]); return lignes.filter((l) => l.user_id === moi && l.token === q.token).map((l) => ({ ...l })); },
    async create(body) {
      appels.push(["create", body]);
      if (body.user_id !== moi) throw Object.assign(new Error("Failed to create record."), { status: 400 });
      const l = { id: `id${lignes.length + 1}`, created_by_id: moi, ...body };
      lignes.push(l);
      return { ...l };
    },
    async update(id, body) {
      appels.push(["update", id, body]);
      const l = lignes.find((x) => x.id === id);
      if (!l || l.created_by_id !== moi || "user_id" in body || "created_by_id" in body) throw err404();
      Object.assign(l, body);
      return { ...l };
    },
  };
  return { DeviceToken };
}

test("nouveau jeton : création avec user_id", async () => {
  const e = fauxDeviceToken("u1");
  const r = await upsertDeviceToken(e, { token: "t1", platform: "android", userId: "u1", now: "N" });
  assert.equal(r.action, "creee");
  assert.deepEqual(e.DeviceToken.lignes[0], { id: "id1", created_by_id: "u1", user_id: "u1", token: "t1", platform: "android", is_active: true, last_seen: "N" });
});

test("jeton existant désactivé (déconnexion) : réactivé SANS envoyer user_id (avant : 404)", async () => {
  const e = fauxDeviceToken("u1", [{ id: "a", created_by_id: "u1", user_id: "u1", token: "t1", platform: "android", is_active: false }]);
  const r = await upsertDeviceToken(e, { token: "t1", platform: "android", userId: "u1", now: "N2" });
  assert.equal(r.action, "mise-a-jour");
  assert.equal(e.DeviceToken.lignes[0].is_active, true);
  assert.equal(e.DeviceToken.lignes[0].last_seen, "N2");
  const update = e.DeviceToken.appels.find((a) => a[0] === "update");
  assert.equal("user_id" in update[2], false);
});

test("mise à jour en 404 (ligne disparue) : une nouvelle ligne est créée", async () => {
  const e = fauxDeviceToken("u1", [{ id: "a", created_by_id: "u1", user_id: "u1", token: "t1", platform: "android", is_active: true }]);
  const filtre = e.DeviceToken.filter.bind(e.DeviceToken);
  e.DeviceToken.filter = async (q) => { const r = await filtre(q); e.DeviceToken.lignes.splice(0); return r; }; // supprimée juste après la lecture
  const r = await upsertDeviceToken(e, { token: "t1", platform: "android", userId: "u1" });
  assert.equal(r.action, "recreee");
  assert.equal(e.DeviceToken.lignes.length, 1);
  assert.equal(e.DeviceToken.lignes[0].is_active, true);
});

test("doublons : un seul reste actif", async () => {
  const e = fauxDeviceToken("u1", [
    { id: "a", created_by_id: "u1", user_id: "u1", token: "t1", is_active: true },
    { id: "b", created_by_id: "u1", user_id: "u1", token: "t1", is_active: true },
  ]);
  const r = await upsertDeviceToken(e, { token: "t1", platform: "android", userId: "u1" });
  assert.equal(r.doublons, 1);
  assert.deepEqual(e.DeviceToken.lignes.map((l) => [l.id, l.is_active]), [["a", true], ["b", false]]);
});

test("autre erreur que 404 : remontée telle quelle (pas de création en double)", async () => {
  const e = fauxDeviceToken("u1", [{ id: "a", created_by_id: "u1", user_id: "u1", token: "t1" }]);
  e.DeviceToken.update = async () => { throw Object.assign(new Error("Too Many Requests"), { status: 429 }); };
  await assert.rejects(upsertDeviceToken(e, { token: "t1", platform: "android", userId: "u1" }), /Mise à jour du token échouée : Too Many Requests/);
  assert.equal(e.DeviceToken.appels.filter((a) => a[0] === "create").length, 0);
});

test("utilisateur ou jeton absent : refusé", async () => {
  await assert.rejects(upsertDeviceToken(fauxDeviceToken("u1"), { token: "t", platform: "android", userId: null }), /non connecté/);
  await assert.rejects(upsertDeviceToken(fauxDeviceToken("u1"), { token: "", platform: "android", userId: "u1" }), /Jeton FCM absent/);
});

test("déconnexion : toutes les lignes du jeton désactivées, sans erreur", async () => {
  const e = fauxDeviceToken("u1", [{ id: "a", created_by_id: "u1", user_id: "u1", token: "t1", is_active: true }]);
  await deactivateDeviceToken(e, "t1");
  assert.equal(e.DeviceToken.lignes[0].is_active, false);
  await deactivateDeviceToken({ DeviceToken: { filter: async () => { throw new Error("réseau"); } } }, "t1"); // ne lève pas
});
