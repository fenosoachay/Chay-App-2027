import test from "node:test";
import assert from "node:assert/strict";
import { createActiveConversationSync } from "./activeConversationSync.js";

const recorder = (delays = {}) => {
  const writes = [];
  const write = (value) => new Promise((resolve) => {
    setTimeout(() => { writes.push(value); resolve(); }, delays[value] ?? 0);
  });
  return { writes, write };
};

test("ouverture puis onglet masqué puis visible : conversation, vide, conversation", async () => {
  const { writes, write } = recorder();
  const sync = createActiveConversationSync("conv1", write);
  sync.visible();
  sync.hidden();
  sync.visible();
  await sync.settled();
  assert.deepEqual(writes, ["conv1", "", "conv1"]);
});

test("événements répétés (visibilitychange + appStateChange) : une seule écriture par changement", async () => {
  const { writes, write } = recorder();
  const sync = createActiveConversationSync("conv1", write);
  sync.visible();
  sync.visible();
  sync.hidden();
  sync.hidden();
  await sync.settled();
  assert.deepEqual(writes, ["conv1", ""]);
});

test("écritures dans l'ordre même si la première est lente (pas de « vide » doublé)", async () => {
  const { writes, write } = recorder({ conv1: 30, "": 0 });
  const sync = createActiveConversationSync("conv1", write);
  sync.visible();
  sync.hidden();
  await sync.settled();
  assert.deepEqual(writes, ["conv1", ""]);
});

test("fermeture de la conversation : vidée ; plus rien n'est remis ensuite", async () => {
  const { writes, write } = recorder();
  const sync = createActiveConversationSync("conv1", write);
  sync.visible();
  sync.dispose();
  sync.visible();
  await sync.settled();
  assert.deepEqual(writes, ["conv1", ""]);
});

test("page déjà masquée à l'ouverture : vidée, puis remise au retour", async () => {
  const { writes, write } = recorder();
  const sync = createActiveConversationSync("conv1", write);
  sync.hidden();
  sync.visible();
  await sync.settled();
  assert.deepEqual(writes, ["", "conv1"]);
});

test("une écriture en échec n'empêche pas les suivantes", async () => {
  const writes = [];
  let first = true;
  const write = async (value) => {
    if (first) { first = false; throw new Error("réseau"); }
    writes.push(value);
  };
  const sync = createActiveConversationSync("conv1", write);
  sync.visible();
  sync.hidden();
  await sync.settled();
  assert.deepEqual(writes, [""]);
});
