import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lire = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("FullImage : image entière (object-contain, hauteur naturelle), jamais object-cover", () => {
  const src = lire("../components/ui/FullImage.jsx");
  assert.match(src, /object-contain/);
  assert.match(src, /h-auto/);
  assert.doesNotMatch(src, /object-cover/);
});

test("couverture d'article et image des nouveautés : affichées avec FullImage, sans recadrage", () => {
  for (const f of ["../components/media/ArticleCard.jsx", "../components/home/ContentDetailDialog.jsx"]) {
    const src = lire(f);
    assert.match(src, /<FullImage src=\{/, f);
    assert.doesNotMatch(src, /object-cover/, f);
    assert.doesNotMatch(src, /fittingType="fill"/, f);
  }
});
