import test from "node:test";
import assert from "node:assert/strict";
import { enregistrerIdentifiants, identifiantsDisponibles, proposerIdentifiants } from "./identifiants.js";

// Hors de l'appli Android (site, tests) : rien n'est proposé ni enregistré, sans erreur.
test("indisponible hors de l'appli Android", () => assert.equal(identifiantsDisponibles(), false));
test("proposer renvoie null hors Android", async () => assert.equal(await proposerIdentifiants(), null));
test("enregistrer renvoie false hors Android", async () => assert.equal(await enregistrerIdentifiants("a@b.fr", "x"), false));
