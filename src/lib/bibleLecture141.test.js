import assert from "node:assert/strict";
import test from "node:test";
import { parseReference } from "./bibleBookRefs.js";

// 1.3.41 : « Lire la Bible » (verset du jour) ouvrait Jean 1 dès que la référence n'était pas exactement « Livre 3:16 ».
const livres = ["JHN", "PHP", "1JN", "PSA", "ACT", "ISA", "2CO"].map((id) => ({ id, name: id, numberOfChapters: 150 }));
const ref = (r) => parseReference(r, livres);

test("verset du jour : références écrites de différentes façons", () => {
  assert.deepEqual(ref("Philippiens 4:13"), { bookId: "PHP", chapter: 4, verse: 13 });
  assert.deepEqual(ref("Philippiens 4.13"), { bookId: "PHP", chapter: 4, verse: 13 });
  assert.deepEqual(ref("Jean 3,16"), { bookId: "JHN", chapter: 3, verse: 16 });
  assert.deepEqual(ref("Jean 3 : 16"), { bookId: "JHN", chapter: 3, verse: 16 });
  assert.deepEqual(ref("Jean 3:16-18"), { bookId: "JHN", chapter: 3, verse: 16 });
  assert.deepEqual(ref("Jean 3:16 (LSG)"), { bookId: "JHN", chapter: 3, verse: 16 });
  assert.deepEqual(ref("1ère Jean 4:8"), { bookId: "1JN", chapter: 4, verse: 8 });
  assert.deepEqual(ref("2ème Corinthiens 5:17"), { bookId: "2CO", chapter: 5, verse: 17 });
  assert.deepEqual(ref("Psaume 23"), { bookId: "PSA", chapter: 23, verse: null });
  assert.deepEqual(ref("Actes des Apôtres 2:38"), { bookId: "ACT", chapter: 2, verse: 38 });
  assert.deepEqual(ref("Ésaïe 40:31"), { bookId: "ISA", chapter: 40, verse: 31 });
  assert.equal(ref("Jean"), null);
});
