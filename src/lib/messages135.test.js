// 1.3.35 : pièces jointes, « vu », fonds des sections, web réservé aux admins, durée en secondes.
import test from "node:test";
import assert from "node:assert/strict";
import { apercuPiece, extensionVocal, formatDuree, genreFichier, ondeDe, typeEnregistrement } from "./piecesJointes.js";
import { positionsVu } from "./vuMessages.js";
import { FONDS, fondPour, sectionDe } from "./fondsSections.js";
import { webFerme } from "./webReserve.js";
import { dureeBande, secondesDe, textesPour } from "./texteDefilant.js";
import { groupesPour } from "./imagesDefilantes.js";
import { isRenderableMessage } from "./messageNotifications.js";

test("pièces jointes : genre, extension du vocal, durée, onde stable", () => {
  assert.equal(genreFichier({ type: "video/mp4", name: "a.mp4" }), "video");
  assert.equal(genreFichier({ type: "", name: "devis.DOCX" }), "document");
  assert.equal(genreFichier({ type: "application/x-foo", name: "a.bin" }), "fichier");
  assert.equal(extensionVocal("audio/webm;codecs=opus"), "weba");
  assert.equal(extensionVocal("audio/mp4"), "m4a");
  assert.equal(typeEnregistrement((t) => t === "audio/mp4"), "audio/mp4");
  assert.equal(formatDuree(7), "0:07");
  assert.equal(formatDuree(599.9), "9:59");
  assert.equal(formatDuree(3723), "1:02:03");
  const a = ondeDe("m1");
  assert.deepEqual(a, ondeDe("m1"));
  assert.notDeepEqual(a, ondeDe("m2"));
  assert.ok(a.every((h) => h >= 0.2 && h <= 1));
  assert.equal(apercuPiece({ genre: "video" }), "🎬 Vidéo");
  assert.equal(isRenderableMessage({ text: "", piece_jointe: { url: "https://x", genre: "vocal" } }), true);
});

test("vu : la photo du lecteur sous le dernier message qu'il a lu, pas sous le sien", () => {
  const m = [
    { id: "1", sender_id: "moi", read_by: ["moi", "b"] },
    { id: "2", sender_id: "moi", read_by: ["moi", "b"] },
    { id: "3", sender_id: "moi", read_by: ["moi"] },
  ];
  assert.deepEqual(positionsVu(m, ["b"]), { 2: ["b"] });
  assert.deepEqual(positionsVu([...m, { id: "4", sender_id: "b", read_by: ["b"] }], ["b"]), {});
  assert.deepEqual(positionsVu(m, ["c"]), {});
});

test("fonds : une section par écran, Nuit dorée gardée la nuit en mode clair", () => {
  assert.equal(Object.keys(FONDS).length, 12);
  assert.equal(sectionDe("/"), "accueil");
  assert.equal(sectionDe("/bible", "?view=sagesse"), "sagesse");
  assert.equal(sectionDe("/bible", "?view=dictionary"), "dictionnaire");
  assert.equal(sectionDe("/bible", "?view=concordance"), "concordance");
  assert.equal(sectionDe("/bible", "?view=reader"), "bible");
  assert.equal(sectionDe("/profile/abc"), "communaute");
  assert.equal(sectionDe("/notifications"), "parametres");
  assert.equal(sectionDe("/admin/membres"), null);
  assert.equal(fondPour("accueil", false).nuit, false);
  assert.equal(fondPour("sagesse", false).nuit, true);
  assert.equal(fondPour("sagesse", false).force, true);
  assert.equal(fondPour("jeux", true).force, false);
  assert.equal(fondPour(null, true), null);
});

test("web réservé aux admins ; l'APK n'est pas concerné", () => {
  assert.equal(webFerme({ natif: false, user: null }), true);
  assert.equal(webFerme({ natif: false, user: { role: "user" } }), true);
  assert.equal(webFerme({ natif: false, user: { role: "admin" } }), false);
  assert.equal(webFerme({ natif: true, user: { role: "user" } }), false);
  assert.equal(webFerme({ natif: true, user: null }), false);
});

test("texte et image qui défilent : durée réglée en secondes, sinon la vitesse", () => {
  assert.equal(secondesDe(10), 10);
  assert.equal(secondesDe("20"), 20);
  assert.equal(secondesDe(0), null);
  assert.equal(secondesDe(9999), 600);
  const piste = { id: "t1", mediaType: "music" };
  const [t] = textesPour([{ id: "a", texte: "Bonjour", ou: "partout", secondes: 5 }], piste);
  assert.equal(t.secondes, 5);
  assert.equal(dureeBande([{ secondes: 5 }, { secondes: 10 }], 999), 15);
  assert.equal(dureeBande([{ vitesse: 45 }], 450), 10);
  const [g] = groupesPour([{ id: "g", images: ["a", "b"], ou: "partout", secondes: 3, vitesse: "lent" }], piste);
  assert.equal(g.secondes, 3);
});

test("1.3.36 : réactions (pastille, choix immédiat, liste)", async () => {
  const { REACTIONS, resume, appliquer, lecteursReactions } = await import("./reactionsMessages.js");
  assert.equal(REACTIONS.length, 6);
  assert.deepEqual(resume({ a: "❤️", b: "❤️", c: "😆", d: "👍", e: "😮" }), { emojis: ["❤️", "😆", "😮"], total: 5 });
  assert.deepEqual(resume(null), { emojis: [], total: 0 });
  assert.deepEqual(appliquer({ a: "❤️" }, "a", "❤️"), {});
  assert.deepEqual(lecteursReactions({ a: "👍", b: "❤️" }).map((x) => x.uid), ["b", "a"]);
});
