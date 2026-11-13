import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LIVRES_SAGESSE, audiosParChapitre, chapitreValide, fileSagesse, lireNomFichierAudio, nomFichierAudio, routeChapitre } from "./sagesseAudio.js";
import { routeValide } from "./routesNotification.js";
import { definitionBibleAudio } from "../../pocketbase/scripts/migrer-1-3-8.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("livres (1.3.8) : Proverbes 31 chapitres, Ecclésiaste 12 ; plus de Psaumes", () => {
  assert.deepEqual(LIVRES_SAGESSE.map((l) => [l.id, l.nom, l.chapitres]), [["proverbes", "Proverbes", 31], ["ecclesiaste", "Ecclésiaste", 12]]);
  assert.ok(chapitreValide("ecclesiaste", 12));
  assert.ok(!chapitreValide("ecclesiaste", 13));
  assert.ok(chapitreValide("proverbes", 31));
  assert.ok(!chapitreValide("proverbes", 32));
  assert.ok(!chapitreValide("psaumes", 1));
});

test("file de lecture : chapitres disponibles dans l'ordre ; fiches Psaumes ignorées", () => {
  const rows = [
    { id: "c", book: "ecclesiaste", chapter: 12, audio_url: "https://r2/e12.mp3" },
    { id: "a", book: "ecclesiaste", chapter: 1, audio_url: "https://r2/e1.mp3" },
    { id: "x", book: "ecclesiaste", chapter: 13, audio_url: "https://r2/x.mp3" },
    { id: "p", book: "psaumes", chapter: 23, audio_url: "https://r2/p23.mp3" },
    { id: "z", book: "proverbes", chapter: 3, audio_url: "https://r2/pr3.mp3" },
  ];
  const f = fileSagesse("ecclesiaste", rows);
  assert.deepEqual(f.map((t) => [t.title, t.chapitre]), [["Ecclésiaste 1", 1], ["Ecclésiaste 12", 12]]);
  assert.equal(f[1].mediaType, "bible");
  assert.equal(f[1].route, "/bible?view=sagesse&livre=ecclesiaste&chapitre=12");
  assert.ok(routeValide(routeChapitre("ecclesiaste", 12)));
  assert.deepEqual(fileSagesse("psaumes", rows), []);
  assert.equal(audiosParChapitre(rows, "proverbes").size, 1);
});

test("noms des fichiers du dépôt en masse : Ecclesiaste-01.mp3 (casse et accents ignorés)", () => {
  assert.deepEqual(lireNomFichierAudio("Ecclesiaste-01.mp3"), { livre: "ecclesiaste", chapitre: 1 });
  assert.deepEqual(lireNomFichierAudio("ecclesiaste-12.mp3"), { livre: "ecclesiaste", chapitre: 12 });
  assert.deepEqual(lireNomFichierAudio("Ecclésiaste-7.mp3"), { livre: "ecclesiaste", chapitre: 7 });
  assert.deepEqual(lireNomFichierAudio("Proverbes-31.mp3"), { livre: "proverbes", chapitre: 31 });
  assert.equal(lireNomFichierAudio("Ecclesiaste-13.mp3"), null);
  assert.equal(lireNomFichierAudio("Psaumes-012.mp3"), null);
  assert.equal(nomFichierAudio("ecclesiaste", 3), "Ecclesiaste-03.mp3");
  assert.equal(nomFichierAudio("proverbes", 1), "Proverbes-01.mp3");
});

test("écran : carrés numérotés (au moins 4 colonnes), état en lecture, envoi R2 réservé aux admins ; schéma 1.3.8", () => {
  const vue = lire("src/components/bible/SagesseAudio.jsx");
  assert.ok(vue.includes("grid-cols-[repeat(auto-fill,minmax(min(3.5rem,calc((100%-1.5rem)/4)),1fr))]"));
  assert.match(vue, /aria-current=\{actif \? "true" : undefined\}/);
  assert.match(vue, /\{isAdmin && \(/);
  assert.match(vue, /envoyerAudioBible\(f, \{ livre: livre\.id, chapitre/);
  assert.doesNotMatch(vue, /download|psaume/i);
  assert.match(lire("src/pages/Bible.jsx"), /Proverbes & Ecclésiaste à écouter/);
  const col = definitionBibleAudio();
  assert.deepEqual(col.fields.find((f) => f.name === "book").values, ["proverbes", "ecclesiaste"]);
  assert.equal(col.fields.find((f) => f.name === "chapter").max, 31);
  assert.equal(col.listRule, '@request.auth.id != ""');
  assert.equal(col.createRule, '@request.auth.role = "admin"');
});
