import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LIVRES_SAGESSE, audiosParChapitre, chapitreValide, fileSagesse, lireNomFichierAudio, nomFichierAudio, routeChapitre } from "./sagesseAudio.js";
import { routeValide } from "./routesNotification.js";
import { nouvellesCollections } from "../../pocketbase/scripts/migrer-1-3-7.mjs";

const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("livres : Proverbes 31 chapitres, Psaumes 150", () => {
  assert.deepEqual(LIVRES_SAGESSE.map((l) => [l.id, l.chapitres]), [["proverbes", 31], ["psaumes", 150]]);
  assert.ok(chapitreValide("psaumes", 150));
  assert.ok(!chapitreValide("proverbes", 32));
  assert.ok(!chapitreValide("psaumes", 0));
  assert.ok(!chapitreValide("genese", 1));
});

test("file de lecture : chapitres disponibles dans l'ordre, lecteur global (type bible), route valide", () => {
  const rows = [
    { id: "c", book: "psaumes", chapter: 23, audio_url: "https://r2/p23.mp3" },
    { id: "a", book: "psaumes", chapter: 1, audio_url: "https://r2/p1.mp3" },
    { id: "x", book: "psaumes", chapter: 151, audio_url: "https://r2/x.mp3" },
    { id: "y", book: "psaumes", chapter: 2, audio_url: "" },
    { id: "z", book: "proverbes", chapter: 3, audio_url: "https://r2/pr3.mp3" },
  ];
  const f = fileSagesse("psaumes", rows);
  assert.deepEqual(f.map((t) => [t.title, t.chapitre]), [["Psaumes 1", 1], ["Psaumes 23", 23]]);
  assert.equal(f[1].mediaType, "bible");
  assert.equal(f[1].route, "/bible?view=sagesse&livre=psaumes&chapitre=23");
  assert.ok(routeValide(routeChapitre("psaumes", 150)));
  assert.equal(audiosParChapitre(rows, "proverbes").size, 1);
  assert.deepEqual(fileSagesse("inconnu", rows), []);
});

test("noms des fichiers du dépôt en masse", () => {
  assert.deepEqual(lireNomFichierAudio("Proverbes-01.mp3"), { livre: "proverbes", chapitre: 1 });
  assert.deepEqual(lireNomFichierAudio("Psaumes-012.mp3"), { livre: "psaumes", chapitre: 12 });
  assert.deepEqual(lireNomFichierAudio("psaumes-150.MP3"), { livre: "psaumes", chapitre: 150 });
  assert.equal(lireNomFichierAudio("Proverbes-32.mp3"), null);
  assert.equal(lireNomFichierAudio("Psaumes-12.wav"), null);
  assert.equal(lireNomFichierAudio("Genese-01.mp3"), null);
  assert.equal(nomFichierAudio("proverbes", 1), "Proverbes-01.mp3");
  assert.equal(nomFichierAudio("psaumes", 12), "Psaumes-012.mp3");
});

test("écran : entrée Bible, carrés numérotés, état en lecture, envoi R2 réservé aux admins ; schéma", () => {
  const page = lire("src/pages/Bible.jsx");
  assert.match(page, /const VIEWS = \["reader", "dictionary", "concordance", "notes", "sagesse"\];/);
  assert.match(page, /Sagesse en audio/);
  const vue = lire("src/components/bible/SagesseAudio.jsx");
  // Au moins 4 colonnes, même à 200 % de taille de texte.
  assert.ok(vue.includes("grid-cols-[repeat(auto-fill,minmax(min(3.5rem,calc((100%-1.5rem)/4)),1fr))]"));
  assert.match(vue, /aspect-square/);
  assert.match(vue, /aria-current=\{actif \? "true" : undefined\}/);
  assert.match(vue, /\{isAdmin && \(/);
  assert.match(vue, /envoyerAudioBible\(f, \{ livre: livre\.id, chapitre/);
  assert.doesNotMatch(vue, /download/i);
  const [col] = nouvellesCollections();
  assert.equal(col.name, "BibleAudio");
  assert.equal(col.listRule, '@request.auth.id != ""');
  assert.equal(col.createRule, '@request.auth.role = "admin"');
  assert.match(col.indexes[0], /UNIQUE INDEX .*\(`book`, `chapter`\)/);
});
