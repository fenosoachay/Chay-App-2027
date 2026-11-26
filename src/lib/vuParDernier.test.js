import assert from "node:assert/strict";
import test from "node:test";
import { vuParDernier } from "./vuParDernier.js";

test("« Vu » : photos de ceux qui ont lu MON dernier message", () => {
  const p = ["moi", "ralph", "zo"];
  assert.deepEqual(vuParDernier({ sender_id: "moi", read_by: ["moi", "ralph"] }, "moi", p), ["ralph"]);
  assert.deepEqual(vuParDernier({ sender_id: "moi", read_by: ["moi"] }, "moi", p), []); // pas encore vu
  assert.deepEqual(vuParDernier({ sender_id: "ralph", read_by: ["moi", "ralph"] }, "moi", p), []); // pas mon message
  assert.deepEqual(vuParDernier({ sender_id: "moi", read_by: ["zo", "ralph", "zo", "parti"] }, "moi", p), ["zo", "ralph"]);
  assert.deepEqual(vuParDernier(null, "moi", p), []);
});
