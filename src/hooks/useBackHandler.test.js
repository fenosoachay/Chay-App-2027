import assert from "node:assert/strict";
import test from "node:test";

// Simulateur minimal de l'History API (le navigateur exécute popstate de façon
// asynchrone après back()). On teste le MODÈLE du hook (pile + compteur de
// back() internes) sans React, en reproduisant fidèlement sa logique.

function makeEnv() {
  const entries = [{ state: { idx: 0 } }];
  let pos = 0;
  const listeners = [];
  const pending = [];
  const history = {
    get state() { return entries[pos].state; },
    pushState(state) { entries.splice(pos + 1); entries.push({ state }); pos += 1; },
    back() { if (pos > 0) { pos -= 1; pending.push(true); } },
  };
  const flush = () => { while (pending.length) { pending.shift(); listeners.forEach((l) => l()); } };
  return { history, listeners, flush, get pos() { return pos; } };
}

function makeHook(env) {
  const stack = [];
  let pendingSelfBacks = 0;
  const onPop = () => {
    if (pendingSelfBacks > 0) { pendingSelfBacks -= 1; return; }
    const top = stack.pop();
    if (!top) return;
    top.entryPushed = false;
    top.close();
  };
  env.listeners.push(onPop);
  return {
    open(close) {
      const entry = { close, entryPushed: true };
      stack.push(entry);
      env.history.pushState({ chayOverlay: true, idx: env.history.state.idx + 1 });
      return () => {
        const i = stack.indexOf(entry);
        if (i === -1) return;
        stack.splice(i, 1);
        if (entry.entryPushed && env.history.state?.chayOverlay) {
          pendingSelfBacks += 1;
          env.history.back();
        }
      };
    },
    get depth() { return stack.length; },
  };
}

test("retour ferme la superposition et revient à la page (pas de fantôme)", () => {
  const env = makeEnv();
  const hook = makeHook(env);
  let closed = 0;
  let cleanup;
  cleanup = hook.open(() => { closed += 1; cleanup(); });
  assert.equal(env.pos, 1);
  env.history.back(); env.flush(); // bouton retour du téléphone
  assert.equal(closed, 1);
  assert.equal(env.pos, 0);
  assert.equal(hook.depth, 0);
});

test("fermeture par X consomme l'entrée et ne ferme rien d'autre", () => {
  const env = makeEnv();
  const hook = makeHook(env);
  let closedB = 0;
  const cleanupA = hook.open(() => {});
  hook.open(() => { closedB += 1; });
  cleanupA(); // A fermée par X alors que B est au-dessus
  env.flush();
  assert.equal(closedB, 0, "B ne doit pas être fermée par le back() interne");
});

test("deux superpositions : deux retours les ferment dans l'ordre inverse", () => {
  const env = makeEnv();
  const hook = makeHook(env);
  const order = [];
  hook.open(() => order.push("section"));
  hook.open(() => order.push("photo"));
  env.history.back(); env.flush();
  env.history.back(); env.flush();
  assert.deepEqual(order, ["photo", "section"]);
  assert.equal(env.pos, 0);
});

test("retour sans superposition ne fait rien (React Router gère)", () => {
  const env = makeEnv();
  makeHook(env);
  env.history.back(); env.flush();
  assert.equal(env.pos, 0);
});

test("ouvrir, fermer par X, rouvrir, retour : toujours cohérent", () => {
  const env = makeEnv();
  const hook = makeHook(env);
  const c1 = hook.open(() => {});
  c1(); env.flush();
  assert.equal(env.pos, 0);
  let closed = 0;
  hook.open(() => { closed += 1; });
  env.history.back(); env.flush();
  assert.equal(closed, 1);
  assert.equal(env.pos, 0);
});