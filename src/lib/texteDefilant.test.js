import test from "node:test";
import assert from "node:assert/strict";
import { COULEURS, VITESSES, dureePassage, lecteurDe, textesPour } from "./texteDefilant.js";
import { COLLECTIONS, completerSelects, copieVideo, profilsDepuisScores } from "../../pocketbase/scripts/migrer-1-3-26.mjs";

const musique = { id: "t1", mediaType: "music", playlist_id: "sous1" };
const T = (o) => ({ id: o.id || "x", texte: "Bienvenue", direction: "gauche", ou: "partout", ...o });

test("texte qui défile : lecteur du titre en cours", () => {
  assert.equal(lecteurDe(musique), "musique");
  assert.equal(lecteurDe({ mediaType: "sermons" }), "predication");
  assert.equal(lecteurDe({ mediaType: "bible" }), "bible");
  assert.equal(lecteurDe({ mediaType: "radio" }), null);
  assert.deepEqual(textesPour([T({})], { mediaType: "radio" }), []);
});

test("texte qui défile : où, quand, sur quoi", () => {
  const rows = [
    T({ id: "a", ou: "partout", order: 2 }),
    T({ id: "b", ou: "musique", order: 1 }),
    T({ id: "c", ou: "predication" }),
    T({ id: "d", ou: "musique", debut: "2026-12-01" }),
    T({ id: "e", ou: "musique", fin: "2026-11-23" }),
    T({ id: "f", ou: "musique", debut: "2026-11-24", fin: "2026-11-24" }),
    T({ id: "g", ou: "musique", track_id: "autre" }),
    T({ id: "h", ou: "musique", track_id: "t1" }),
    T({ id: "i", ou: "musique", playlist_id: "parent1" }),
    T({ id: "j", ou: "musique", playlist_id: "ailleurs" }),
    T({ id: "k", ou: "musique", texte: "   " }),
  ];
  const ids = textesPour(rows, musique, { aujourdhui: "2026-11-24", parents: new Map([["sous1", "parent1"]]) }).map((t) => t.id);
  assert.deepEqual(ids, ["b", "a", "f", "h", "i"]);
});

test("texte qui défile : couleur, vitesse, direction par défaut ; durée d'un passage", () => {
  const [t] = textesPour([T({ direction: "monte", couleur: "dore", vitesse: "lent", texte: "  Dieu \n vous aime " })], musique);
  assert.equal(t.direction, "monte");
  assert.equal(t.couleur, COULEURS.dore);
  assert.equal(t.vitesse, VITESSES.lent);
  assert.equal(t.texte, "Dieu vous aime");
  const [u] = textesPour([T({ direction: "?", couleur: "?" })], musique);
  assert.equal(u.direction, "gauche");
  assert.equal(u.couleur, COULEURS.blanc);
  assert.equal(u.vitesse, VITESSES.normal);
  assert.equal(dureePassage(450, 45), 10);
  assert.equal(dureePassage(20, 45), 4);
});

test("migration 1.3.26 : copie de Video, listes fermées, enfants retrouvés", () => {
  const v = copieVideo({
    name: "Video", listRule: "audience = 'tous'", viewRule: "", createRule: null, updateRule: null, deleteRule: null,
    fields: [{ id: "f0", name: "id", type: "text" }, { id: "f1", name: "title", type: "text" }],
    indexes: ["CREATE INDEX `idx_video_created` ON `Video` (`created`)"],
  });
  assert.equal(v.name, "VideoEnfant");
  assert.deepEqual(v.fields, [{ name: "title", type: "text" }]);
  assert.deepEqual(v.indexes, ["CREATE INDEX `idx_video_created_enfant` ON `VideoEnfant` (`created`)"]);
  assert.equal(v.listRule, "audience = 'tous'");

  const f = completerSelects([{ name: "category", type: "select", values: ["music", "films"] }, { name: "t", type: "text" }]);
  assert.deepEqual(f[0].values, ["music", "films", "enfants"]);
  assert.equal(completerSelects([{ name: "category", type: "select", values: ["music"] }]), null);
  assert.equal(completerSelects(f), null);

  const p = profilsDepuisScores([
    { user_id: "u1", pseudo: "Mickael", avatar: "🦁", created: "2026-11-01" },
    { user_id: "u1", pseudo: "mickael", avatar: "🐻", created: "2026-11-20" },
    { user_id: "u2", pseudo: "Mickael", avatar: "🐑", created: "2026-11-02" },
    { user_id: "", pseudo: "X", created: "2026-11-02" },
  ]);
  assert.deepEqual(p, [{ user_id: "u1", pseudo: "mickael", avatar: "🐻" }, { user_id: "u2", pseudo: "Mickael", avatar: "🐑" }]);

  const profil = COLLECTIONS.find((c) => c.name === "ProfilEnfant");
  assert.match(profil.listRule, /user_id = @request\.auth\.id/);
  assert.equal(profil.createRule, profil.listRule);
  const texte = COLLECTIONS.find((c) => c.name === "TexteDefilant");
  assert.equal(texte.createRule, '@request.auth.role = "admin"');
});
