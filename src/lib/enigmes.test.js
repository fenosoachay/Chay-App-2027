import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ALPHABET, AZERTY, ENIGMES, MORSE, TOUCHES, avoter, calculer, chiffres, clavierDecale, dumbphone, envers, fleches, lettresConnues,
  morse, normaliser, ouvert, pointsNiveau, reponseJuste, cle, GLYPHE, etoilesNiveau, initiales,
} from "./enigmes.js";
import { normalizeLocalBooks, normalizeLocalChapter } from "./localBible.js";
import { analyserReference, textePassage } from "./versetsEnMasse.js";

const decoder = {
  avoter: (t) => t.split(" ").map((m) => [...m].map((l) => ALPHABET[(ALPHABET.indexOf(l) + 26 - 19) % 26]).join("")).join(" "),
  morse: (mots) => mots.map((m) => m.map((f) => Object.keys(MORSE).find((l) => fleches(MORSE[l]) === f)).join("")).join(" "),
  dumbphone: (mots) => mots.map((m) => m.map(({ chiffre, fois }) => TOUCHES[chiffre][fois - 1]).join("")).join(" "),
  chiffres: (mots) => mots.map((m) => m.map((x) => ALPHABET[calculer(x) - 1]).join("")).join(" "),
  clavier: (t) => t.split(" ").map((m) => [...m].map((l) => { const r = AZERTY.find((x) => x.includes(l)); return r[(r.indexOf(l) + r.length - 1) % r.length]; }).join("")).join(" "),
};

test("1.3.32 : 8 énigmes de 3 niveaux ; chaque codage se décode en la bonne réponse", () => {
  assert.equal(ENIGMES.length, 8);
  for (const e of ENIGMES) {
    assert.equal(e.niveaux.length, 3, e.id);
    for (const n of e.niveaux) assert.equal(normaliser(n.reponse), n.reponse);
  }
  const rep = (id, k) => ENIGMES.find((e) => e.id === id).niveaux[k].reponse;
  for (let k = 0; k < 3; k += 1) {
    assert.equal(decoder.avoter(avoter(rep("avoter", k))), rep("avoter", k));
    assert.equal(decoder.morse(morse(rep("morse", k))), rep("morse", k));
    assert.equal(decoder.dumbphone(dumbphone(rep("dumbphone", k))), rep("dumbphone", k));
    assert.equal(decoder.chiffres(chiffres(rep("chiffres", k), k > 0)), rep("chiffres", k));
    assert.equal(decoder.clavier(clavierDecale(rep("clavier", k))), rep("clavier", k));
    assert.equal(envers(envers(rep("miroir", k))), rep("miroir", k));
  }
  assert.equal(avoter("ABC"), "TUV"); // l'exemple : TUV -> ABC
  assert.deepEqual(dumbphone("JTM")[0].map((x) => `${x.chiffre}${x.fois}`), ["51", "81", "61"]);
  assert.equal(new Set(Object.values(GLYPHE)).size, 26);
  assert.ok(chiffres("SALUT", true)[0].every((x) => /[×+−]/.test(x) && calculer(x) >= 1));
});

test("Égypte : la table montre les lettres déjà trouvées et laisse quelques lettres à deviner", () => {
  const e = ENIGMES.find((x) => x.id === "egypte");
  const reps = e.niveaux.map((n) => n.reponse);
  e.niveaux.forEach((n, k) => {
    const connues = lettresConnues(reps, k, n.cachees);
    const ici = new Set(normaliser(n.reponse).replace(/ /g, ""));
    const manquent = [...ici].filter((l) => !connues.has(l));
    assert.ok(manquent.length >= 1 && manquent.length <= n.cachees, `niveau ${k + 1} : ${manquent.join("")}`);
    for (const r of reps.slice(0, k)) for (const l of r.replace(/ /g, "")) assert.ok(connues.has(l));
  });
});

test("Référence secrète : les mots comptés dans la Bible de l'app donnent la réponse", () => {
  const raw = JSON.parse(fs.readFileSync(new URL("../../public/data/bibles/lsg1910_fr_CORRIGE.json", import.meta.url), "utf8"));
  const books = normalizeLocalBooks(raw);
  for (const n of ENIGMES.find((x) => x.id === "reference").niveaux) {
    const trouves = n.refs.map(([ref, rangMot]) => {
      const r = analyserReference(ref, books);
      const texte = textePassage(normalizeLocalChapter(raw, r.bookId, r.chapitre), r.debut, r.fin);
      return texte.split(/\s+/)[rangMot - 1];
    });
    assert.ok(reponseJuste(trouves.join(" "), n.reponse), `${trouves.join(" ")} ≠ ${n.reponse}`);
  }
});

test("réponse juste, ouverture des niveaux, points", () => {
  assert.equal(reponseJuste("  dieu  est Amour ! ", "DIEU EST AMOUR"), true);
  assert.equal(reponseJuste("Moïse", "MOISE"), true);
  assert.equal(reponseJuste("MOISES", "MOISE"), false);
  const et = { [cle(0, 0)]: 3, [cle(0, 1)]: 1 };
  assert.equal(ouvert(et, 0, 0), true);
  assert.equal(ouvert(et, 0, 2), true);
  assert.equal(ouvert(et, 1, 0), false);
  assert.equal(ouvert({ ...et, [cle(0, 2)]: 2 }, 1, 0), true);
  assert.equal(ouvert(et, 1, 1), false);
  assert.equal(pointsNiveau(1, 1, 3), 25);
  assert.equal(pointsNiveau(8, 3, 1), 25);
  assert.equal(pointsNiveau(9, 1, 3), 0);
  // 1.3.32 : indices payants, jamais de mode d'emploi gratuit
  assert.deepEqual([etoilesNiveau(3, 0), etoilesNiveau(3, 1), etoilesNiveau(2, 0), etoilesNiveau(1, 3)], [3, 2, 2, 1]);
  assert.equal(initiales("Dieu est amour"), "D… E… A…");
  for (const e of ENIGMES) {
    assert.equal(e.consigne, undefined, e.id);
    assert.ok(e.indices.length >= 2, e.id);
  }
});
