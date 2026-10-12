import assert from "node:assert/strict";
import test from "node:test";
import { isGeolocationSupported, probeLocationStatus, subscribeToGeolocationPermission } from "./locationGate.js";

function makeNav({ getCurrentPosition } = {}) {
  return { geolocation: getCurrentPosition ? { getCurrentPosition } : undefined };
}

test("isGeolocationSupported reflects navigator.geolocation presence", () => {
  assert.equal(isGeolocationSupported(makeNav({ getCurrentPosition: () => {} })), true);
  assert.equal(isGeolocationSupported(makeNav()), false);
  assert.equal(isGeolocationSupported(undefined), false);
});

test("probeLocationStatus resolves 'unsupported' when geolocation is unavailable", async () => {
  const status = await probeLocationStatus(makeNav());
  assert.equal(status, "unsupported");
});

test("probeLocationStatus resolves 'active' when a position is obtained", async () => {
  const nav = makeNav({ getCurrentPosition: (success) => success({ coords: {} }) });
  assert.equal(await probeLocationStatus(nav), "active");
});

test("probeLocationStatus resolves 'denied' on PERMISSION_DENIED (code 1)", async () => {
  const nav = makeNav({ getCurrentPosition: (_s, error) => error({ code: 1 }) });
  assert.equal(await probeLocationStatus(nav), "denied");
});

test("probeLocationStatus resolves 'inactive' on POSITION_UNAVAILABLE (code 2) when never granted", async () => {
  const unavailable = makeNav({ getCurrentPosition: (_s, error) => error({ code: 2 }) });
  assert.equal(await probeLocationStatus(unavailable), "inactive");
});

test("probeLocationStatus never blocks on a TIMEOUT (code 3): slow GPS is not a disabled location", async () => {
  const timeout = makeNav({ getCurrentPosition: (_s, error) => error({ code: 3 }) });
  assert.equal(await probeLocationStatus(timeout), "active");
});

test("subscribeToGeolocationPermission no-ops gracefully without the Permissions API", () => {
  const unsubscribe = subscribeToGeolocationPermission(() => {}, makeNav());
  assert.equal(typeof unsubscribe, "function");
  assert.doesNotThrow(() => unsubscribe());
});

test("subscribeToGeolocationPermission forwards permission state changes", async () => {
  let storedHandler;
  const statusObj = {
    state: "granted",
    set onchange(fn) { storedHandler = fn; },
  };
  const nav = {
    permissions: { query: () => Promise.resolve(statusObj) },
  };
  const changes = [];
  subscribeToGeolocationPermission((state) => changes.push(state), nav);
  // Laisse la micro-tâche de la promesse se résoudre avant de déclencher le changement.
  await Promise.resolve();
  await Promise.resolve();
  statusObj.state = "denied";
  storedHandler();
  assert.deepEqual(changes, ["denied"]);
});

// Tests pour probeLocationStatus avec l'API Permissions (nouveau comportement).
test("probeLocationStatus uses Permissions API when available and returns active", async () => {
  const statusObj = { state: "granted" };
  const nav = {
    geolocation: { getCurrentPosition: () => {} },
    permissions: { query: () => Promise.resolve(statusObj) },
  };
  assert.equal(await probeLocationStatus(nav), "active");
});

test("probeLocationStatus uses Permissions API when available and returns denied", async () => {
  const statusObj = { state: "denied" };
  const nav = {
    geolocation: { getCurrentPosition: () => {} },
    permissions: { query: () => Promise.resolve(statusObj) },
  };
  assert.equal(await probeLocationStatus(nav), "denied");
});

test("probeLocationStatus falls back to getCurrentPosition when Permissions returns prompt", async () => {
  const statusObj = { state: "prompt" };
  const nav = {
    geolocation: { getCurrentPosition: (success) => success({ coords: {} }) },
    permissions: { query: () => Promise.resolve(statusObj) },
  };
  assert.equal(await probeLocationStatus(nav), "active");
});

test("probeLocationStatus falls back to getCurrentPosition when Permissions API is unavailable", async () => {
  const nav = {
    geolocation: { getCurrentPosition: (success) => success({ coords: {} }) },
  };
  assert.equal(await probeLocationStatus(nav), "active");
});

test("probeLocationStatus falls back to getCurrentPosition when Permissions API throws", async () => {
  const nav = {
    geolocation: { getCurrentPosition: (success) => success({ coords: {} }) },
    permissions: { query: () => Promise.reject(new Error("failed")) },
  };
  assert.equal(await probeLocationStatus(nav), "active");
});

test("probeLocationStatus returns inactive when Permissions returns prompt and position is unavailable", async () => {
  const statusObj = { state: "prompt" };
  const nav = {
    geolocation: { getCurrentPosition: (_s, error) => error({ code: 2 }) },
    permissions: { query: () => Promise.resolve(statusObj) },
  };
  assert.equal(await probeLocationStatus(nav), "inactive");
});